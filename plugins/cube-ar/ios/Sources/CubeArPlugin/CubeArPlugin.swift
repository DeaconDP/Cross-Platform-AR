import ARKit
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
        CAPPluginMethod(name: "palmState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notePalm", returnType: CAPPluginReturnPromise),
    ]

    private var arView: ARSCNView?
    private var cubeSizeM: Float = 0.12
    private var cubeColorHex: String = "#30d158"
    private var placedCount = 0
    private var surfaceFound = false
    private var reticleNode: SCNNode?
    private var palmKind = "ok"
    private var palmRaw = "ok"
    private var palmSince: TimeInterval = 0
    private var palmFat = false
    private var palmSmear = false
    private var palmTimer: Timer?

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
                self.startPalmWatch()
                self.notifyTracking(state: "initializing", message: "Move phone to find a surface")
                call.resolve()
            } catch {
                self.detachArView()
                call.reject("Failed to start native AR: \(error.localizedDescription)")
            }
        }
    }

    @objc func palmState(_ call: CAPPluginCall) {
        call.resolve(palmPayload())
    }

    @objc func notePalm(_ call: CAPPluginCall) {
        applyPalmCall(call)
        call.resolve(palmPayload())
    }

    private func palmPayload() -> [String: Any] {
        [
            "kind": palmKind,
            "fat": palmFat,
            "smear": palmSmear,
            "valid": true,
        ]
    }

    private func applyPalmCall(_ call: CAPPluginCall) {
        let major = CGFloat(call.getFloat("major") ?? 0)
        let pointers = call.getInt("pointers") ?? 1
        palmFat = major >= 48
        palmSmear = pointers >= 3
        tickPalm(forceRaw: true)
    }

    private func startPalmWatch() {
        stopPalmWatch()
        palmKind = "ok"
        palmRaw = "ok"
        palmSince = 0
        palmFat = false
        palmSmear = false
        let timer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
            self?.tickPalm(forceRaw: false)
        }
        timer.tolerance = 0.15
        RunLoop.main.add(timer, forMode: .common)
        palmTimer = timer
        tickPalm(forceRaw: false)
    }

    private func stopPalmWatch() {
        palmTimer?.invalidate()
        palmTimer = nil
        palmKind = "ok"
        palmFat = false
        palmSmear = false
    }

    private func tickPalm(forceRaw: Bool) {
        let raw = palmSmear ? "smear" : (palmFat ? "fat" : "ok")
        let now = Date().timeIntervalSince1970
        if palmSince == 0 {
            palmSince = now
            palmRaw = raw
            palmKind = "ok"
            return
        }
        if forceRaw || raw != palmRaw {
            palmRaw = raw
            palmSince = now
            if forceRaw && raw != "ok" {
                palmKind = raw
                notifyListeners("palmChanged", data: palmPayload())
            }
            return
        }
        if raw == palmKind { return }
        let need: TimeInterval = raw == "ok" ? 0.8 : 0.4
        if now - palmSince < need { return }
        palmKind = raw
        notifyListeners("palmChanged", data: palmPayload())
    }

    @objc func stopSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.stopPalmWatch()
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
        applyPalmCall(call)

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let view = self.arView else {
                var miss = self?.palmPayload() ?? [:]
                miss["placed"] = false
                miss["count"] = self?.placedCount ?? 0
                call.resolve(miss)
                return
            }
            if self.palmKind == "fat" || self.palmKind == "smear" {
                var payload = self.palmPayload()
                payload["placed"] = false
                payload["count"] = self.placedCount
                call.resolve(payload)
                return
            }

            let placed = self.placeCube(at: CGPoint(x: CGFloat(x), y: CGFloat(y)), in: view)
            call.resolve(["placed": placed, "count": self.placedCount])
        }
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

extension CubeARPlugin: ARSCNViewDelegate, ARSessionDelegate {
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
