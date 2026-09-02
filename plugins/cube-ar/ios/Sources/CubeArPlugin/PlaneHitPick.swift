import ARKit
import simd

/// Prefer a classified table and keep cubes inside the plane, not on the lip.
enum PlaneHitPick {
    static let edgeMargin: Float = 0.04
    static let tinyHalf: Float = 0.08

    static func best(_ results: [ARRaycastResult]) -> ARRaycastResult? {
        var picked: ARRaycastResult?
        var bestScore = Int.max
        for result in results {
            let s = score(result)
            if s < bestScore {
                bestScore = s
                picked = result
            }
        }
        return picked
    }

    static func pick(in view: ARSCNView, at point: CGPoint) -> ARRaycastResult? {
        if let query = view.raycastQuery(
            from: point,
            allowing: .existingPlaneGeometry,
            alignment: .horizontal
        ) {
            if let hit = best(view.session.raycast(query)) {
                return hit
            }
        }
        guard let estimated = view.raycastQuery(
            from: point,
            allowing: .estimatedPlane,
            alignment: .horizontal
        ) else {
            return nil
        }
        return view.session.raycast(estimated).first
    }

    static func score(_ result: ARRaycastResult) -> Int {
        guard let plane = result.anchor as? ARPlaneAnchor else { return 50 }
        let classRank: Int
        if ARPlaneAnchor.isClassificationSupported {
            switch plane.classification {
            case .table: classRank = 0
            case .seat: classRank = 1
            case .floor: classRank = 2
            case .none: classRank = 3
            default: classRank = 8
            }
        } else {
            classRank = 3
        }
        let local = plane.transform.inverse * result.worldTransform.columns.3
        let halfX = max(plane.extent.x / 2, 0.001)
        let halfZ = max(plane.extent.z / 2, 0.001)
        let inset = isInsetLocal(lx: local.x, lz: local.z, halfX: halfX, halfZ: halfZ)
        let area = plane.extent.x * plane.extent.z
        let centerNorm = min(1, hypot(local.x / halfX, local.z / halfZ))
        return scoreParts(classRank: classRank, inset: inset, areaM2: area, centerNorm: centerNorm)
    }

    static func isInsetLocal(lx: Float, lz: Float, halfX: Float, halfZ: Float) -> Bool {
        if halfX < tinyHalf || halfZ < tinyHalf { return true }
        let mx = min(edgeMargin, halfX * 0.25)
        let mz = min(edgeMargin, halfZ * 0.25)
        return abs(lx) <= halfX - mx && abs(lz) <= halfZ - mz
    }

    static func scoreParts(classRank: Int, inset: Bool, areaM2: Float, centerNorm: Float) -> Int {
        var score = classRank * 100
        if !inset { score += 40 }
        score -= Int(min(areaM2, 2) * 10)
        score += Int(min(1, max(0, centerNorm)) * 20)
        return score
    }
}
