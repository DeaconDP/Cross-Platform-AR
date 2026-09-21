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
        CAPPluginMethod(name: "moveScreen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reposition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recenter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rotate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setScale", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "debugPlaceFront", returnType: CAPPluginReturnPromise),
    ]

    private var arView: ARSCNView?
    private var cubeSizeM: Float = 0.12
    private var cubeColorHex: String = "#30d158"
    private var surfaceFound = false
    private var reticleNode: SCNNode?
    private var originalOpaque = true

    private var placed = false
    private var placedRoot: SCNNode?
    private var placedNode: SCNNode?
    private var scaleFactor: Float = 1
    private var introMultiplier: Float = 1
    private var baseScale: Float = 1
    private var spawning = false
    private var lastTrackingKey: String?

    private static let emergeRiseMs: TimeInterval = 0.52
    private static let emergeJiggleMs: TimeInterval = 0.38
    private static let emergeStartY: Float = 0.08
    private static let emergeOvershoot: Float = 1.18

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

        if let rawTechnique = call.getString("technique")?.lowercased(), !rawTechnique.isEmpty, rawTechnique != "place" {
            call.reject("The \"\(rawTechnique)\" AR technique is Android-only (ARCore)")
            return
        }

        cubeSizeM = Float(call.getDouble("cubeSizeM") ?? 0.12)
        cubeColorHex = call.getString("colorHex") ?? "#30d158"
        placed = false
        surfaceFound = false
        scaleFactor = 1
        introMultiplier = 1
        spawning = false
        lastTrackingKey = nil

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
            guard let self = self else {
                call.resolve(["placed": false])
                return
            }
            let didPlace = self.placeAt(x: CGFloat(x), y: CGFloat(y))
            call.resolve(["placed": didPlace])
            if didPlace {
                self.notifyListeners("placed", data: [:])
            }
        }
    }

    @objc func moveScreen(_ call: CAPPluginCall) {
        let x = CGFloat(call.getFloat("x") ?? 0)
        let y = CGFloat(call.getFloat("y") ?? 0)
        DispatchQueue.main.async { [weak self] in
            call.resolve(["moved": self?.moveAt(x: x, y: y) ?? false])
        }
    }

    @objc func reposition(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.clearPlaced()
            call.resolve()
        }
    }

    @objc func recenter(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.faceCamera(alignViewpoint: true)
            call.resolve()
        }
    }

    @objc func rotate(_ call: CAPPluginCall) {
        let dx = call.getFloat("dx") ?? 0
        let dy = call.getFloat("dy") ?? 0
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let node = self.placedNode, !self.spawning else {
                call.resolve()
                return
            }
            let yawRad = dx * (.pi / 180) * 0.45
            let pitchRad = dy * (.pi / 180) * 0.30
            if yawRad != 0 {
                node.simdLocalRotate(by: simd_quatf(angle: yawRad, axis: SIMD3<Float>(0, 1, 0)))
            }
            if pitchRad != 0 {
                node.simdLocalRotate(by: simd_quatf(angle: pitchRad, axis: SIMD3<Float>(1, 0, 0)))
            }
            call.resolve()
        }
    }

    @objc func setScale(_ call: CAPPluginCall) {
        let factor = call.getFloat("factor") ?? 1
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve()
                return
            }
            self.scaleFactor = max(0.35, min(2.4, factor))
            if !self.spawning {
                self.applyScale()
            }
            call.resolve()
        }
    }

    @objc func debugPlaceFront(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let arView = self.arView, let camera = arView.pointOfView else {
                call.resolve(["placed": false, "error": "no-session"])
                return
            }
            self.clearPlaced()
            let forward = camera.simdWorldFront
            let world = camera.simdWorldPosition + forward * 0.55
            var transform = matrix_identity_float4x4
            transform.columns.3 = SIMD4<Float>(world.x, world.y, world.z, 1)

            let root = SCNNode()
            root.simdWorldTransform = transform
            arView.scene.rootNode.addChildNode(root)

            let content = self.makeCubeNode()
            root.addChildNode(content)
            self.placedRoot = root
            self.placedNode = content
            self.placed = true
            self.reticleNode?.isHidden = true
            self.faceCamera()
            self.startEmergence(on: content)
            self.notifyListeners("placed", data: [:])
            self.notifyTracking(state: "ready", message: "Cube placed")
            call.resolve(["placed": true])
        }
    }

    private func attachArView() throws {
        detachArView()

        guard let webView = bridge?.webView else {
            throw NSError(domain: "CubeAR", code: 1, userInfo: [NSLocalizedDescriptionKey: "WebView unavailable"])
        }

        originalOpaque = webView.isOpaque
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.superview?.backgroundColor = .clear
        bridge?.viewController?.view.backgroundColor = .clear

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
        clearPlaced()
        arView?.session.pause()
        arView?.removeFromSuperview()
        arView = nil
        reticleNode = nil
        surfaceFound = false
        lastTrackingKey = nil

        if let webView = bridge?.webView {
            webView.isOpaque = originalOpaque
            webView.backgroundColor = .white
            webView.scrollView.backgroundColor = .white
        }
    }

    private func makeCubeNode() -> SCNNode {
        let cube = SCNBox(
            width: CGFloat(cubeSizeM),
            height: CGFloat(cubeSizeM),
            length: CGFloat(cubeSizeM),
            chamferRadius: 0,
        )
        cube.firstMaterial?.diffuse.contents = UIColor.color(fromHex: cubeColorHex)
        cube.firstMaterial?.roughness.contents = 0.8
        cube.firstMaterial?.metalness.contents = 0
        cube.firstMaterial?.lightingModel = .physicallyBased

        let node = SCNNode(geometry: cube)
        node.position.y = cubeSizeM / 2
        baseScale = 1
        return node
    }

    private func hitHorizontal(x: CGFloat, y: CGFloat) -> ARRaycastResult? {
        guard let arView else { return nil }
        let point: CGPoint
        if x <= 1.5 && y <= 1.5 {
            point = CGPoint(x: x * arView.bounds.width, y: y * arView.bounds.height)
        } else {
            point = CGPoint(x: x, y: y)
        }
        let allowings: [ARRaycastQuery.Target] = [
            .estimatedPlane,
            .existingPlaneInfinite,
            .existingPlaneGeometry,
        ]
        for allowing in allowings {
            guard let query = arView.raycastQuery(
                from: point,
                allowing: allowing,
                alignment: .horizontal
            ) else {
                continue
            }
            if let hit = arView.session.raycast(query).first {
                return hit
            }
        }
        return nil
    }

    private func placeAt(x: CGFloat, y: CGFloat) -> Bool {
        guard !placed, let arView else { return false }
        guard let result = hitHorizontal(x: x, y: y) else { return false }

        let root = SCNNode()
        root.simdWorldTransform = result.worldTransform
        arView.scene.rootNode.addChildNode(root)

        let content = makeCubeNode()
        root.addChildNode(content)
        placedRoot = root
        placedNode = content
        placed = true
        reticleNode?.isHidden = true
        faceCamera()
        startEmergence(on: content)
        notifyTracking(state: "ready", message: "Cube placed")
        return true
    }

    private func moveAt(x: CGFloat, y: CGFloat) -> Bool {
        guard placed, !spawning, let root = placedRoot, let content = placedNode else {
            return false
        }
        guard let result = hitHorizontal(x: x, y: y) else { return false }
        let euler = content.eulerAngles
        let localScale = content.scale
        let localPosition = content.position
        root.simdWorldTransform = result.worldTransform
        content.eulerAngles = euler
        content.scale = localScale
        content.position = localPosition
        return true
    }

    private func applyScale() {
        guard let node = placedNode else { return }
        let scale = CGFloat(baseScale * scaleFactor * introMultiplier)
        node.scale = SCNVector3(scale, scale, scale)
    }

    private func faceCamera(alignViewpoint: Bool = false) {
        guard let node = placedNode, let root = placedRoot, let camera = arView?.pointOfView else {
            return
        }
        let cameraWorld = camera.worldPosition
        let localCam = root.convertPosition(cameraWorld, from: nil)
        let localPos = node.position
        let dx = localCam.x - localPos.x
        let dy = localCam.y - localPos.y
        let dz = localCam.z - localPos.z
        let horiz = sqrt(dx * dx + dz * dz)
        guard horiz > 1e-5 else { return }

        let yaw = atan2(dx, dz)
        if !alignViewpoint {
            node.eulerAngles = SCNVector3(0, yaw, 0)
            return
        }
        let pitch = max(-40 * .pi / 180, min(40 * .pi / 180, -atan2(dy, horiz)))
        node.eulerAngles = SCNVector3(pitch, yaw, 0)
    }

    private func startEmergence(on content: SCNNode) {
        content.removeAllActions()
        if UIAccessibility.isReduceMotionEnabled {
            introMultiplier = 1
            content.position.y = cubeSizeM / 2
            applyScale()
            spawning = false
            return
        }

        introMultiplier = 0.08
        let restY = cubeSizeM / 2
        content.position.y = restY + Self.emergeStartY
        applyScale()
        spawning = true

        let riseDuration = Self.emergeRiseMs
        let jiggleDuration = Self.emergeJiggleMs
        let startY = Self.emergeStartY
        let overshoot = Self.emergeOvershoot

        let rise = SCNAction.customAction(duration: riseDuration) { [weak self] node, elapsed in
            guard let self else { return }
            let t = Float(min(1, elapsed / riseDuration))
            let eased = self.easeOutBack(t)
            self.introMultiplier = max(0.08, overshoot * eased)
            node.position.y = restY + startY * (1 - eased)
            self.applyScale()
        }
        let jiggle = SCNAction.customAction(duration: jiggleDuration) { [weak self] node, elapsed in
            guard let self else { return }
            let t = Float(min(1, elapsed / jiggleDuration))
            self.introMultiplier = self.jiggleIntro(t)
            node.position.y = restY
            self.applyScale()
        }
        let finish = SCNAction.run { [weak self] node in
            guard let self else { return }
            self.introMultiplier = 1
            node.position.y = restY
            self.spawning = false
            self.applyScale()
        }
        content.runAction(SCNAction.sequence([rise, jiggle, finish]))
    }

    private func easeOutBack(_ t: Float) -> Float {
        let c1: Float = 2.2
        let c3 = c1 + 1
        let u = t - 1
        return 1 + c3 * u * u * u + c1 * u * u
    }

    private func easeOutCubic(_ t: Float) -> Float {
        let u = 1 - t
        return 1 - u * u * u
    }

    private func lerp(_ a: Float, _ b: Float, _ t: Float) -> Float {
        a + (b - a) * t
    }

    private func jiggleIntro(_ t: Float) -> Float {
        let u = max(0, min(1, t))
        let ts: [Float] = [0, 0.35, 0.7, 1]
        let vs: [Float] = [Self.emergeOvershoot, 0.94, 1.06, 1]
        for i in 0..<(ts.count - 1) {
            if u <= ts[i + 1] {
                let local = (u - ts[i]) / max(0.0001, ts[i + 1] - ts[i])
                return lerp(vs[i], vs[i + 1], easeOutCubic(local))
            }
        }
        return 1
    }

    private func clearPlaced() {
        placedNode?.removeAllActions()
        placedRoot?.removeFromParentNode()
        placedRoot = nil
        placedNode = nil
        placed = false
        spawning = false
        introMultiplier = 1
        scaleFactor = 1
        notifyTracking(state: "ready", message: "Tap to place a cube")
    }

    private func updateReticle(in view: ARSCNView) {
        guard let reticle = reticleNode else { return }
        if placed {
            reticle.isHidden = true
            return
        }
        let center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
        guard let result = hitHorizontal(x: center.x, y: center.y) else {
            reticle.isHidden = true
            return
        }
        reticle.simdTransform = result.worldTransform
        reticle.isHidden = false
    }

    private func notifyTracking(state: String, message: String? = nil) {
        let key = "\(state)\u{0}\(message ?? "")"
        guard key != lastTrackingKey else { return }
        lastTrackingKey = key
        var data: [String: Any] = ["state": state]
        if let message = message {
            data["message"] = message
        }
        notifyListeners("trackingChanged", data: data)
    }
}

extension CubeARPlugin: ARSCNViewDelegate, ARSessionDelegate {
    public func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
        guard let view = arView else { return }
        DispatchQueue.main.async { [weak self] in
            self?.updateReticle(in: view)
        }
    }

    public func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        switch camera.trackingState {
        case .normal:
            // Ready as soon as tracking is normal — estimatedPlane works without a mature mesh.
            if !surfaceFound {
                surfaceFound = true
            }
            notifyTracking(
                state: "ready",
                message: placed ? "Cube placed" : "Tap to place a cube",
            )
        case .limited(let reason):
            switch reason {
            case .initializing:
                notifyTracking(state: "initializing", message: "Starting ARKit tracking")
            case .excessiveMotion:
                notifyTracking(state: "limited", message: "Move the phone more slowly")
            case .insufficientFeatures:
                notifyTracking(state: "limited", message: "Point the camera at a textured surface")
            case .relocalizing:
                notifyTracking(state: "limited", message: "Restoring tracking")
            @unknown default:
                notifyTracking(state: "limited", message: "Tracking limited")
            }
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
