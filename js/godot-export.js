import { $ } from "./dom.js";
import { state } from "./state.js";
import { rectOf } from "./model.js";
import { SHAPE_CIRCLE, SHAPE_CAPSULE } from "./constants.js";
import { effectiveName, findDuplicateNames } from "./validation.js";
import { markDirty } from "./utils.js";
import { createZip } from "./zip.js";
import { commitPendingEditor } from "./editor.js";

function basename(name) {
  return (name || "atlas").replace(/\.[^.]+$/, "");
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").trim() || "object";
}

function godotEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function godotNodeName(name) {
  return godotEscape(sanitizeFilename(name)).replace(/ /g, "_");
}

export function syncGodotAtlasPath() {
  const el = $("godotAtlasPath");
  if (!el || !state.imageName) return;
  const cur = el.value.trim();
  if (cur && cur !== "res://") return;
  el.value = `res://${state.imageName}`;
}

function getGodotAtlasPath() {
  const path = $("godotAtlasPath")?.value.trim();
  if (!path) {
    alert("请填写 Godot 贴图路径。");
    return null;
  }
  return path;
}

function collisionToGodot(c, spriteOffset) {
  if (!c) return null;
  const ox = spriteOffset.x, oy = spriteOffset.y;
  const px = ox + c.position[0], py = oy + c.position[1];
  if (c.shape === SHAPE_CIRCLE) {
    return {
      shape: "CircleShape2D",
      position: `Vector2(${px}, ${py})`,
      radius: c.radius,
    };
  }
  if (c.shape === SHAPE_CAPSULE) {
    return {
      shape: "CapsuleShape2D",
      position: `Vector2(${px}, ${py})`,
      radius: c.radius,
      height: c.height,
    };
  }
  return {
    shape: "RectangleShape2D",
    position: `Vector2(${px}, ${py})`,
    size: `Vector2(${c.size[0]}, ${c.size[1]})`,
  };
}

function generateObjectTscn(o, atlasPath) {
  const r = rectOf(o);
  const [ax, ay] = o.anchor;
  const ox = -ax * r.w, oy = -ay * r.h;
  const col = collisionToGodot(o.collision, { x: ox, y: oy });
  const nodeName = godotNodeName(effectiveName(o));

  const lines = [
    `[gd_scene load_steps=${col ? 4 : 3} format=3]`,
    "",
    `[ext_resource type="Texture2D" path="${godotEscape(atlasPath)}" id="1_atlas"]`,
    "",
    `[sub_resource type="AtlasTexture" id="2_tex"]`,
    `atlas = ExtResource("1_atlas")`,
    `region = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})`,
  ];

  if (col) {
    lines.push("");
    lines.push(`[sub_resource type="${col.shape}" id="3_shape"]`);
    if (col.shape === "CircleShape2D") {
      lines.push(`radius = ${col.radius}`);
    } else if (col.shape === "CapsuleShape2D") {
      lines.push(`radius = ${col.radius}`);
      lines.push(`height = ${col.height}`);
    } else {
      lines.push(`size = ${col.size}`);
    }
  }

  lines.push("");
  lines.push(`[node name="${nodeName}" type="Node2D"]`);
  lines.push("");
  lines.push(`[node name="Sprite2D" type="Sprite2D" parent="."]`);
  lines.push("centered = false");
  lines.push(`offset = Vector2(${ox}, ${oy})`);
  lines.push('texture = SubResource("2_tex")');

  if (col) {
    lines.push("");
    lines.push(`[node name="StaticBody2D" type="StaticBody2D" parent="."]`);
    lines.push("collision_layer = 1");
    lines.push("collision_mask = 1");
    lines.push("");
    lines.push(`[node name="CollisionShape2D" type="CollisionShape2D" parent="StaticBody2D"]`);
    lines.push(`position = ${col.position}`);
    lines.push('shape = SubResource("3_shape")');
  }

  lines.push("");
  return lines.join("\n");
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportGodotScene() {
  if (!commitPendingEditor()) return;
  if (!state.img) {
    alert("请先加载 Atlas 图片。");
    return;
  }
  if (!state.objects.length) {
    alert("没有可导出的区域，请先分割或标注物件。");
    return;
  }

  const dupes = findDuplicateNames();
  if (dupes.length) {
    const msg = dupes.map(d => `「${d.name}」(#${d.indices.map(i => i + 1).join(", #")})`).join("\n");
    alert(`存在重复名称，请修改后再导出：\n${msg}`);
    return;
  }

  const atlasPath = getGodotAtlasPath();
  if (!atlasPath) return;

  const base = basename(state.imageName);
  const sceneDir = `${base}_scenes`;

  const zipEntries = state.objects.map(o => ({
    name: `${sceneDir}/${sanitizeFilename(effectiveName(o))}.tscn`,
    data: generateObjectTscn(o, atlasPath),
  }));

  downloadBlob(createZip(zipEntries), `${base}_scenes.zip`);
  markDirty(false);
}
