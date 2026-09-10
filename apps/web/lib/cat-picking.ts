import { BufferGeometry, Float32BufferAttribute, Raycaster, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";
import type { Camera, Intersection, Object3D, Vector2 } from "three";
import data from "@/public/models/our-cat/picking.json";

export type CatLeg = "front left" | "front right" | "rear left" | "rear right";
export type CatPick = { material: string; position: { x: number; y: number; z: number }; leg?: CatLeg; nose?: boolean };

/** Interpolate the rig's own skin weights at the contact, even in moving poses. */
export function catLegAtHit(hit: Intersection): CatLeg | undefined {
  const mesh = hit.object as SkinnedMesh;
  if (!mesh.isSkinnedMesh || !hit.face || !hit.barycoord || Array.isArray(mesh.material) ||
      mesh.material.name !== "White fur, grey saddle patches and pink nose") return;
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const weights: Record<CatLeg, number> = { "front left": 0, "front right": 0, "rear left": 0, "rear right": 0 };
  const vertices = [hit.face.a, hit.face.b, hit.face.c];
  for (let corner = 0; corner < 3; corner++) {
    const vertex = vertices[corner];
    for (let i = 0; i < skinIndex.itemSize; i++) {
      const bone = mesh.skeleton.bones[skinIndex.getComponent(vertex, i)];
      const match = /^j_([lr])_(humerous|elbow|wrist|palm|finger|forearm|femur|knee|ankle|ball|toe)_/.exec(bone.name);
      if (!match) continue;
      const leg: CatLeg = `${["femur", "knee", "ankle", "ball", "toe"].includes(match[2]) ? "rear" : "front"} ${match[1] === "l" ? "left" : "right"}`;
      weights[leg] += skinWeight.getComponent(vertex, i) * hit.barycoord.getComponent(corner);
    }
  }
  return (Object.keys(weights) as CatLeg[]).find(leg => weights[leg] > .55);
}

/** Detached CPU-only meshes. They share live bones but never enter the renderer. */
export function createCatPicker(root: Object3D, camera: () => Camera, ndc: (x: number, y: number) => Vector2) {
  const sources: SkinnedMesh[] = [];
  root.traverse(object => { if ((object as SkinnedMesh).isSkinnedMesh) sources.push(object as SkinnedMesh); });
  const pairs: { source: SkinnedMesh; proxy: SkinnedMesh }[] = [];
  let pose = 0, disposed = false;
  try {
    for (const entry of data.meshes) {
      const source = sources.find(mesh => mesh.name === entry.name && !Array.isArray(mesh.material) &&
        mesh.material.name === entry.material && mesh.geometry.getAttribute("position").count === entry.sourceVertices);
      if (!source || Object.keys(source.geometry.morphAttributes).length) throw new Error("Cat picking mesh does not match this asset");
      const geometry = new BufferGeometry();
      for (const name of ["position", "skinIndex", "skinWeight"] as const) {
        const attribute = source.geometry.getAttribute(name);
        const values = entry.vertices.flatMap(index => Array.from({ length: attribute.itemSize }, (_, component) => attribute.getComponent(index, component)));
        geometry.setAttribute(name, name === "skinIndex"
          ? new Uint16BufferAttribute(values, attribute.itemSize) : new Float32BufferAttribute(values, attribute.itemSize));
      }
      geometry.setIndex(entry.triangles);
      const proxy = new SkinnedMesh(geometry, source.material);
      pairs.push({ source, proxy });
      proxy.name = entry.material;
      proxy.skeleton = source.skeleton;
      proxy.bindMode = source.bindMode;
      // Skin each compact vertex once per pick, including the bounds pass.
      // Adjacent triangles reuse these exact results instead of reskinning it.
      const vertices = new Float64Array(entry.vertices.length * 3);
      const stamps = new Float64Array(entry.vertices.length);
      const getVertex = proxy.getVertexPosition.bind(proxy);
      proxy.getVertexPosition = (index, target) => {
        if (stamps[index] !== pose) {
          getVertex(index, target).toArray(vertices, index * 3);
          stamps[index] = pose;
        }
        return target.fromArray(vertices, index * 3);
      };
    }
    if (pairs.length !== sources.length) throw new Error("Cat picking mesh is incomplete");
  } catch (error) {
    for (const { proxy } of pairs) proxy.geometry.dispose();
    throw error;
  }
  const ray = new Raycaster(), point = new Vector3(), nosePoint = new Vector3();
  const head = root.getObjectByName("j_head_08");
  const proxies = pairs.map(pair => pair.proxy);
  return {
    pick(x: number, y: number): CatPick | null {
      if (disposed) return null;
      pose++;
      root.updateWorldMatrix(true, true);
      for (const { source, proxy } of pairs) {
        proxy.matrixWorld.copy(source.matrixWorld);
        proxy.bindMatrix.copy(source.bindMatrix);
        proxy.bindMatrixInverse.copy(source.bindMatrixInverse);
        proxy.visible = source.visible;
        // Bounds must follow the CURRENT pose, including raised tails and paws.
        proxy.computeBoundingSphere();
      }
      ray.setFromCamera(ndc(x, y), camera());
      const hit = ray.intersectObjects(proxies, false).find(hit => hit.object.visible);
      if (!hit) return null;
      // A small contact zone in the authored head's coordinates follows its
      // live rotation/translation, without a visible material or extra mesh.
      let nose = false;
      if (head && hit.object.name === "Head touch region") {
        head.worldToLocal(nosePoint.copy(hit.point));
        nose = ((nosePoint.x - 5.2) / .5) ** 2 + (nosePoint.y / .62) ** 2 + ((nosePoint.z + .53) / .43) ** 2 < 1;
      }
      root.worldToLocal(point.copy(hit.point));
      return { material: hit.object.name, position: { x: point.x, y: point.y, z: point.z }, leg: catLegAtHit(hit), nose };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { proxy } of pairs) proxy.geometry.dispose();
    },
  };
}
