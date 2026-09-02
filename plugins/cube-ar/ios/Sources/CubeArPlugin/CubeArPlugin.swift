import ARKit
import AVFoundation
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
    ]

    private var arView: ARSCNView?
    private var cubeSizeM: Float = 0.12
    private var cubeColorHex: String = "#30d158"
    private var placedCount = 0
    private var surfaceFound = false
    private var reticleNode: SCNNode?
    private var lastMapping = ""
    private var lastHeartbeat: TimeInterval = 0
    private var worldMapSaved = false
    private var worldMapRestored = false

    private static let worldMapTTL: TimeInterval = 12 * 60
    private static let nearMissSlack: Float = 0.12
    private static let heartbeatSec: TimeInterval = 2

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

        softenAudioSession()
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
        worldMapRestored = false
        worldMapSaved = false
        lastMapping = ""
        lastHeartbeat = 0
        if let map = loadRecentWorldMap() {
            config.initialWorldMap = map
            worldMapRestored = true
            view.session.run(config, options: [.removeExistingAnchors])
        } else {
            view.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        }

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
        lastMapping = ""
        lastHeartbeat = 0

        bridge?.webView.isOpaque = true
        bridge?.webView.backgroundColor = .white
    }

    private func placeCube(at point: CGPoint, in view: ARSCNView) -> Bool {
        guard let xf = hitHorizontal(from: point, in: view) else { return false }

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
        node.simdTransform = xf
        node.position.y += cubeSizeM / 2
        node.eulerAngles.y = Float.random(in: 0...(2 * Float.pi))

        view.scene.rootNode.addChildNode(node)
        placedCount += 1
        return true
    }

    private func updateReticle(in view: ARSCNView, frame: ARFrame) {
        guard let reticle = reticleNode else { return }
        let center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
        guard let xf = hitHorizontal(from: center, in: view) else {
            reticle.isHidden = true
            return
        }

        reticle.simdTransform = xf
        reticle.isHidden = false
        if !surfaceFound {
            surfaceFound = true
            notifyTracking(state: "ready", message: "Tap to place a cube")
        }
    }

    private func hitHorizontal(from point: CGPoint, in view: ARSCNView) -> simd_float4x4? {
        if let query = view.raycastQuery(from: point, allowing: .existingPlaneGeometry, alignment: .horizontal) {
            let hits = view.session.raycast(query)
            if let best = pickBestHit(hits) {
                return best.worldTransform
            }
        }
        return nearMissTransform(from: point, in: view)
    }

    private func pickBestHit(_ results: [ARRaycastResult]) -> ARRaycastResult? {
        guard !results.isEmpty else { return nil }
        if ARPlaneAnchor.isClassificationSupported {
            return results.min(by: { classificationRank($0) < classificationRank($1) })
        }
        return results.first
    }

    private func classificationRank(_ result: ARRaycastResult) -> Int {
        guard let plane = result.anchor as? ARPlaneAnchor else { return 4 }
        switch plane.classification {
        case .table: return 0
        case .seat: return 1
        case .floor: return 2
        default: return 3
        }
    }

    private func nearMissTransform(from point: CGPoint, in view: ARSCNView) -> simd_float4x4? {
        guard let query = view.raycastQuery(from: point, allowing: .existingPlaneGeometry, alignment: .horizontal),
              let frame = view.session.currentFrame
        else { return nil }
        let origin = query.origin
        let dir = simd_normalize(query.direction)
        var bestDist = Self.nearMissSlack
        var best: simd_float4x4?
        for anchor in frame.anchors {
            guard let plane = anchor as? ARPlaneAnchor, plane.alignment == .horizontal else { continue }
            let planeY = plane.transform.columns.3.y
            if abs(dir.y) < 1e-4 { continue }
            let t = (planeY - origin.y) / dir.y
            if t < 0.2 || t > 4 { continue }
            let hit = origin + dir * t
            let local = simd_mul(simd_inverse(plane.transform), simd_float4(hit.x, hit.y, hit.z, 1))
            let dx = abs(local.x - plane.center.x)
            let dz = abs(local.z - plane.center.z)
            let outside = hypot(max(0, dx - plane.extent.x / 2), max(0, dz - plane.extent.z / 2))
            if outside <= bestDist {
                bestDist = outside
                var xf = plane.transform
                xf.columns.3 = simd_float4(hit.x, planeY, hit.z, 1)
                best = xf
            }
        }
        return best
    }

    private func softenAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        } catch {
            /* leave the session as-is */
        }
    }

    private func worldMapURL() -> URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("cube-ar.arworldmap")
    }

    private func loadRecentWorldMap() -> ARWorldMap? {
        let url = worldMapURL()
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
              let date = attrs[.modificationDate] as? Date,
              Date().timeIntervalSince(date) < Self.worldMapTTL,
              let data = try? Data(contentsOf: url),
              let map = try? NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data)
        else { return nil }
        return map
    }

    private func maybePersistWorldMap(_ frame: ARFrame) {
        guard !worldMapSaved, frame.worldMappingStatus == .mapped, let session = arView?.session else { return }
        worldMapSaved = true
        session.getCurrentWorldMap { [weak self] map, _ in
            guard let self, let map,
                  let data = try? NSKeyedArchiver.archivedData(withRootObject: map, requiringSecureCoding: true)
            else {
                self?.worldMapSaved = false
                return
            }
            try? data.write(to: self.worldMapURL(), options: .atomic)
        }
    }

    private func emitMapping(_ status: ARFrame.WorldMappingStatus) {
        let key: String
        switch status {
        case .mapped: key = "mapped"
        case .extending: key = "extending"
        case .limited: key = "limited"
        default: key = "notAvailable"
        }
        guard key != lastMapping else { return }
        lastMapping = key
        notifyListeners("mapping", data: ["status": key, "worldMapRestored": worldMapRestored])
    }

    private func emitHeartbeat(at time: TimeInterval) {
        guard time - lastHeartbeat >= Self.heartbeatSec else { return }
        lastHeartbeat = time
        notifyListeners("arHeartbeat", data: [:])
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
        emitMapping(frame.worldMappingStatus)
        emitHeartbeat(at: time)
        maybePersistWorldMap(frame)
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
