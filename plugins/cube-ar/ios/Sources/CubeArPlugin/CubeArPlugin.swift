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
        CAPPluginMethod(name: "dockState", returnType: CAPPluginReturnPromise),
    ]

    private var arView: ARSCNView?
    private var cubeSizeM: Float = 0.12
    private var cubeColorHex: String = "#30d158"
    private var placedCount = 0
    private var surfaceFound = false
    private var reticleNode: SCNNode?
    private var dockObserver: NSObjectProtocol?
    private var dockTimer: Timer?
    private var dockKind = "ok"
    private var dockRaw = "ok"
    private var dockSince: TimeInterval = 0
    private var chargeFlag = false
    private var deskFlag = false

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
        startDockWatch()
    }

    @objc func dockState(_ call: CAPPluginCall) {
        call.resolve(dockPayload())
    }

    private func dockPayload() -> [String: Any] {
        [
            "kind": dockKind,
            "desk": deskFlag,
            "charge": chargeFlag,
            "valid": true,
        ]
    }

    private func startDockWatch() {
        stopDockWatch()
        dockKind = "ok"
        dockRaw = "ok"
        dockSince = 0
        chargeFlag = false
        deskFlag = false
        UIDevice.current.isBatteryMonitoringEnabled = true
        dockObserver = NotificationCenter.default.addObserver(
            forName: UIDevice.batteryStateDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.readDockFlags()
            self?.tickDock(forceRaw: false)
        }
        readDockFlags()
        tickDock(forceRaw: false)
        dockTimer = Timer.scheduledTimer(withTimeInterval: 0.8, repeats: true) { [weak self] _ in
            self?.readDockFlags()
            self?.tickDock(forceRaw: false)
        }
    }

    private func stopDockWatch() {
        dockTimer?.invalidate()
        dockTimer = nil
        if let dockObserver {
            NotificationCenter.default.removeObserver(dockObserver)
        }
        dockObserver = nil
        dockKind = "ok"
        chargeFlag = false
        deskFlag = false
        UIDevice.current.isBatteryMonitoringEnabled = false
    }

    private func readDockFlags() {
        let state = UIDevice.current.batteryState
        let charging = state == .charging || state == .full
        chargeFlag = charging
        let pad = UIDevice.current.userInterfaceIdiom == .pad
        deskFlag = charging && (pad || state == .full)
    }

    private func tickDock(forceRaw: Bool) {
        let raw = deskFlag ? "desk" : (chargeFlag ? "charge" : "ok")
        let now = Date().timeIntervalSince1970
        if dockSince == 0 {
            dockSince = now
            dockRaw = raw
            dockKind = "ok"
            return
        }
        if forceRaw || raw != dockRaw {
            dockRaw = raw
            dockSince = now
            if forceRaw {
                dockKind = raw
                notifyListeners("dockChanged", data: dockPayload())
            }
            return
        }
        if raw == dockKind { return }
        let need: TimeInterval = raw == "ok" ? 800 : 400
        if now - dockSince < need { return }
        dockKind = raw
        notifyListeners("dockChanged", data: dockPayload())
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
        stopDockWatch()
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
