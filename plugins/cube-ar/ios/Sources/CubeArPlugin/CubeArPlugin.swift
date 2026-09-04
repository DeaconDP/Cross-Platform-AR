import ARKit
import AVFoundation
import CallKit
import Capacitor
import SceneKit
import UIKit

@objc(CubeARPlugin)
public class CubeARPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CubeARPlugin"
    public let jsName = "CubeAR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "onScreenTap", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "phoneState", returnType: CAPPluginReturnPromise),
    ]

    private var arView: ARSCNView?
    private var cubeSizeM: Float = 0.12
    private var cubeColorHex: String = "#30d158"
    private var placedCount = 0
    private var surfaceFound = false
    private var reticleNode: SCNNode?
    private var callObserver: CXCallObserver?
    private var phoneSupported = true
    private var phoneRinging = false
    private var phoneInCall = false
    private var phoneInterrupted = false
    private var phoneReason = "unknown"
    private var lastPhoneKind = "ok"
    private var phoneCloseWork: DispatchWorkItem?

    @objc func isSupported(_ call: CAPPluginCall) {
        let supported = ARWorldTrackingConfiguration.isSupported
        call.resolve([
            "supported": supported,
            "backend": supported ? "arkit" : "none",
        ])
    }

    @objc func startSession(_ call: CAPPluginCall) {
        guard ARWorldTrackingConfiguration.isSupported else {
            call.reject("ARKit is not supported on this device")
            return
        }

        cubeSizeM = Float(call.getDouble("cubeSizeM") ?? 0.12)
        cubeColorHex = call.getString("colorHex") ?? "#30d158"
        placedCount = 0
        surfaceFound = false

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            do {
                try self.attachArView()
                self.startPhoneWatch()
                self.notifyTracking(state: "initializing", message: "Move phone to find a surface")
                call.resolve()
            } catch {
                self.detachArView()
                call.reject("Failed to start native AR: \(error.localizedDescription)")
            }
        }
    }

    @objc func stopSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.detachArView()
            self?.notifyListeners("sessionEnded", data: [:])
            call.resolve()
        }
    }

    @objc func onScreenTap(_ call: CAPPluginCall) {
        guard let x = call.getFloat("x"), let y = call.getFloat("y") else {
            call.reject("Missing tap coordinates")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let view = self.arView else {
                call.resolve(["placed": false, "count": self?.placedCount ?? 0])
                return
            }
            if self.phoneBusy() {
                call.resolve(["placed": false, "count": self.placedCount, "interrupted": true])
                return
            }

            let placed = self.placeCube(at: CGPoint(x: CGFloat(x), y: CGFloat(y)), in: view)
            call.resolve(["placed": placed, "count": self.placedCount])
        }
    }

    @objc func phoneState(_ call: CAPPluginCall) {
        startPhoneWatch()
        call.resolve(phonePayload())
    }

    private func startPhoneWatch() {
        if callObserver != nil { return }
        let observer = CXCallObserver()
        observer.setDelegate(self, queue: .main)
        callObserver = observer
        applyCalls(observer.calls)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onAudioInterrupt(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    private func stopPhoneWatch() {
        phoneCloseWork?.cancel()
        phoneCloseWork = nil
        NotificationCenter.default.removeObserver(
            self,
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        callObserver?.setDelegate(nil, queue: nil)
        callObserver = nil
        lastPhoneKind = "ok"
    }

    private func applyCalls(_ calls: [CXCall]) {
        phoneRinging = calls.contains { !$0.hasEnded && !$0.hasConnected }
        phoneInCall = calls.contains { !$0.hasEnded && $0.hasConnected }
        if phoneRinging || phoneInCall { phoneReason = "call" }
        maybeEmitPhone()
    }

    @objc private func onAudioInterrupt(_ note: Notification) {
        guard
            let info = note.userInfo,
            let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: raw)
        else { return }
        if type == .began {
            phoneInterrupted = true
            if phoneReason == "unknown" { phoneReason = "focus" }
        } else {
            phoneInterrupted = false
        }
        maybeEmitPhone()
    }

    private func phonePayload() -> [String: Any] {
        [
            "supported": phoneSupported,
            "ringing": phoneRinging,
            "inCall": phoneInCall,
            "interrupted": phoneInterrupted,
            "reason": phoneReason,
        ]
    }

    private func judgePhone() -> String {
        if !phoneSupported { return "ok" }
        if phoneInCall || phoneInterrupted { return "active" }
        if phoneRinging { return "ringing" }
        return "ok"
    }

    private func phoneBusy() -> Bool {
        judgePhone() != "ok"
    }

    private func maybeEmitPhone() {
        let kind = judgePhone()
        if kind == "active" {
            if phoneCloseWork == nil {
                let work = DispatchWorkItem { [weak self] in
                    guard let self, self.judgePhone() == "active" else { return }
                    self.detachArView()
                    self.notifyListeners("sessionEnded", data: [:])
                }
                phoneCloseWork = work
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8, execute: work)
            }
        } else {
            phoneCloseWork?.cancel()
            phoneCloseWork = nil
        }
        guard kind != lastPhoneKind else { return }
        lastPhoneKind = kind
        var ret = phonePayload()
        ret["kind"] = kind
        notifyListeners("phoneChanged", data: ret)
    }

    private func attachArView() throws {
        detachArView()

        guard let webView = bridge?.webView else {
            throw NSError(domain: "CubeAR", code: 1, userInfo: [NSLocalizedDescriptionKey: "WebView unavailable"])
        }

        webView.isOpaque = false
        webView.backgroundColor = .clear

        let view = ARSCNView(frame: webView.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.delegate = self
        view.session.delegate = self
        view.automaticallyUpdatesLighting = true
        view.antialiasingMode = .multisampling4X

        if let superview = webView.superview {
            superview.insertSubview(view, belowSubview: webView)
        } else {
            webView.insertSubview(view, at: 0)
        }

        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal]
        view.session.run(config, options: [.resetTracking, .removeExistingAnchors])

        addReticle(to: view)
        arView = view
    }

    private func addReticle(to view: ARSCNView) {
        let ring = SCNTorus(ringRadius: 0.06, pipeRadius: 0.004)
        ring.firstMaterial?.diffuse.contents = UIColor(red: 0.19, green: 0.82, blue: 0.35, alpha: 0.9)
        let node = SCNNode(geometry: ring)
        node.eulerAngles.x = -.pi / 2
        node.isHidden = true
        view.scene.rootNode.addChildNode(node)
        reticleNode = node
    }

    private func detachArView() {
        stopPhoneWatch()
        arView?.session.pause()
        arView?.removeFromSuperview()
        arView = nil
        reticleNode = nil
        surfaceFound = false

        bridge?.webView.isOpaque = true
        bridge?.webView.backgroundColor = .white
    }

    private func placeCube(at point: CGPoint, in view: ARSCNView) -> Bool {
        guard let query = view.raycastQuery(from: point, allowing: .estimatedPlane, alignment: .horizontal) else {
            return false
        }
        let results = view.session.raycast(query)
        guard let result = results.first else { return false }

        let cube = SCNBox(
            width: CGFloat(cubeSizeM),
            height: CGFloat(cubeSizeM),
            length: CGFloat(cubeSizeM),
            chamferRadius: 0,
        )
        cube.firstMaterial?.diffuse.contents = UIColor.color(fromHex: cubeColorHex)
        cube.firstMaterial?.roughness.contents = 0.35
        cube.firstMaterial?.metalness.contents = 0.15

        let node = SCNNode(geometry: cube)
        node.simdTransform = result.worldTransform
        node.position.y += cubeSizeM / 2
        node.eulerAngles.y = Float.random(in: 0...(2 * Float.pi))

        view.scene.rootNode.addChildNode(node)
        placedCount += 1
        return true
    }

    private func updateReticle(in view: ARSCNView, frame: ARFrame) {
        guard let reticle = reticleNode else { return }
        let center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
        guard let query = view.raycastQuery(from: center, allowing: .estimatedPlane, alignment: .horizontal) else {
            reticle.isHidden = true
            return
        }
        let results = view.session.raycast(query)
        guard let result = results.first else {
            reticle.isHidden = true
            return
        }

        reticle.simdTransform = result.worldTransform
        reticle.isHidden = false
        if !surfaceFound {
            surfaceFound = true
            notifyTracking(state: "ready", message: "Tap to place a cube")
        }
    }

    private func notifyTracking(state: String, message: String? = nil) {
        var data: [String: Any] = ["state": state]
        if let message = message {
            data["message"] = message
        }
        notifyListeners("trackingChanged", data: data)
    }
}

extension CubeARPlugin: ARSCNViewDelegate, ARSessionDelegate, CXCallObserverDelegate {
    public func callObserver(_ callObserver: CXCallObserver, callChanged call: CXCall) {
        applyCalls(callObserver.calls)
    }

    public func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
        guard let view = arView, let frame = view.session.currentFrame else { return }
        DispatchQueue.main.async { [weak self] in
            self?.updateReticle(in: view, frame: frame)
        }
    }

    public func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        switch camera.trackingState {
        case .normal:
            notifyTracking(state: surfaceFound ? "ready" : "initializing")
        case .limited(let reason):
            notifyTracking(state: "limited", message: reason.localizedDescription)
        case .notAvailable:
            notifyTracking(state: "unavailable", message: "Tracking unavailable")
        @unknown default:
            notifyTracking(state: "limited")
        }
    }
}

private extension UIColor {
    static func color(fromHex hex: String) -> UIColor {
        var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if cleaned.hasPrefix("#") { cleaned.removeFirst() }
        guard cleaned.count == 6, let value = Int(cleaned, radix: 16) else {
            return UIColor(red: 0.19, green: 0.82, blue: 0.35, alpha: 1)
        }
        return UIColor(
            red: CGFloat((value >> 16) & 0xFF) / 255,
            green: CGFloat((value >> 8) & 0xFF) / 255,
            blue: CGFloat(value & 0xFF) / 255,
            alpha: 1,
        )
    }
}
