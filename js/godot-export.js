import { state } from "./state.js";
import { rectOf } from "./model.js";
import { SHAPE_RECT, SHAPE_CIRCLE, SHAPE_CAPSULE } from "./constants.js";
import { effectiveName, findDuplicateNames } from "./validation.js";
import { markDirty } from "./utils.js";

function basename(name) {
  return (name || "atlas").replace(/\.[^.]+$/, "");
}

function indexMarker(i) {
  const n = i + 1;
  if (n >= 1 && n <= 20) return String.fromCharCode(0x2460 + n - 1);
  return `(${n})`;
}

function godotEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function godotString(s) {
  return `"${godotEscape(s)}"`;
}

function enumHintLabel(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/:/g, "\\:");
}

function collisionToGodot(c, spriteOffset) {
  if (!c) return null;
  const ox = spriteOffset.x, oy = spriteOffset.y;
  const px = ox + c.position[0], py = oy + c.position[1];
  if (c.shape === SHAPE_CIRCLE) {
    return {
      shape: "circle",
      position: `Vector2(${px}, ${py})`,
      radius: c.radius,
    };
  }
  if (c.shape === SHAPE_CAPSULE) {
    return {
      shape: "capsule",
      position: `Vector2(${px}, ${py})`,
      radius: c.radius,
      height: c.height,
    };
  }
  return {
    shape: "rect",
    position: `Vector2(${px}, ${py})`,
    size: `Vector2(${c.size[0]}, ${c.size[1]})`,
  };
}

function variantEntry(o) {
  const r = rectOf(o);
  const [ax, ay] = o.anchor;
  const id = o.id;
  const ox = -ax * r.w, oy = -ay * r.h;
  const col = collisionToGodot(o.collision, { x: ox, y: oy });
  const lines = [
    `\t${godotString(id)}: {`,
    `\t\t"display_name": ${godotString(effectiveName(o))},`,
    `\t\t"region": Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h}),`,
    `\t\t"sprite_offset": Vector2(${ox}, ${oy}),`,
    `\t\t"grid_size": Vector2i(${o.grid_size[0]}, ${o.grid_size[1]}),`,
  ];
  if (col) {
    lines.push(`\t\t"collision": {`);
    lines.push(`\t\t\t"shape": ${godotString(col.shape)},`);
    lines.push(`\t\t\t"position": ${col.position},`);
    if (col.shape === "circle") lines.push(`\t\t\t"radius": ${col.radius},`);
    else if (col.shape === "capsule") {
      lines.push(`\t\t\t"radius": ${col.radius},`);
      lines.push(`\t\t\t"height": ${col.height},`);
    } else {
      lines.push(`\t\t\t"size": ${col.size},`);
    }
    lines.push(`\t\t},`);
  } else {
    lines.push(`\t\t"collision": null,`);
  }
  lines.push(`\t},`);
  return lines.join("\n");
}

function generateScript(objects) {
  const ids = objects.map(o => o.id);
  const defaultId = ids[0];
  const variants = objects.map(variantEntry).join("\n");
  const idsArray = ids.map(godotString).join(", ");
  const indexEnum = objects.map((o, i) => godotString(`${indexMarker(i)} ${effectiveName(o)}`)).join(", ");
  const nameHint = objects.map(o => `${enumHintLabel(effectiveName(o))}:${enumHintLabel(o.id)}`).join(",");

  return `@tool
extends Node2D

## Atlas 物件场景 — 指定 atlas 贴图后，用 sprite_name 或 variant_index 下拉切换物件。
## sprite_name 实际值为 OBJ_xxx ID；下拉标签优先显示 Name。

const VARIANT_IDS: Array[String] = [${idsArray}]
const SPRITE_NAME_HINT := ${godotString(nameHint)}

const VARIANTS: Dictionary = {
${variants}
}

const DEFAULT_ID := ${godotString(defaultId)}

var _syncing := false
var _sprite: Sprite2D
var _body: StaticBody2D
var _shape: CollisionShape2D

@export var atlas: Texture2D:
	set(value):
		atlas = value
		_update_display()

@export_enum(${indexEnum}) var variant_index: int = 0:
	set(value):
		var idx := clampi(value, 0, VARIANT_IDS.size() - 1)
		if variant_index == idx:
			return
		variant_index = idx
		if not _syncing:
			_syncing = true
			sprite_name = VARIANT_IDS[variant_index]
			_syncing = false
		_update_display()

@export var sprite_name: String = DEFAULT_ID:
	set(value):
		if sprite_name == value:
			return
		sprite_name = value
		if not _syncing:
			_syncing = true
			var idx := VARIANT_IDS.find(sprite_name)
			if idx >= 0:
				variant_index = idx
			_syncing = false
		_update_display()

func _validate_property(property: Dictionary) -> void:
	if property.name == "sprite_name":
		property.hint = PROPERTY_HINT_ENUM
		property.hint_string = SPRITE_NAME_HINT

func _ready() -> void:
	_sprite = $Sprite2D
	_body = $StaticBody2D
	_shape = $StaticBody2D/CollisionShape2D
	_update_display()

func _update_display() -> void:
	if _sprite == null:
		return
	var data: Dictionary = VARIANTS.get(sprite_name, VARIANTS.get(DEFAULT_ID, {}))
	if data.is_empty():
		push_warning("Unknown sprite_name: %s" % sprite_name)
		return
	if atlas == null:
		_sprite.texture = null
		return
	var tex := AtlasTexture.new()
	tex.atlas = atlas
	tex.region = data.region
	_sprite.texture = tex
	_sprite.centered = false
	_sprite.offset = data.sprite_offset
	_apply_collision(data.get("collision"))

func _apply_collision(col: Variant) -> void:
	if _shape == null or _body == null:
		return
	if col == null:
		_shape.shape = null
		_body.collision_layer = 0
		_body.collision_mask = 0
		return
	_body.collision_layer = 1
	_body.collision_mask = 1
	_shape.position = col.position
	match col.shape:
		"circle":
			var s := CircleShape2D.new()
			s.radius = col.radius
			_shape.shape = s
		"capsule":
			var s := CapsuleShape2D.new()
			s.radius = col.radius
			s.height = col.height
			_shape.shape = s
		_:
			var s := RectangleShape2D.new()
			s.size = col.size
			_shape.shape = s
`;
}

function generateTscn(script, atlasFile, defaultId) {
  const sceneName = basename(state.imageName);
  const atlasPath = `res://${atlasFile}`;

  return `[gd_scene load_steps=3 format=3]

[ext_resource type="Texture2D" path="${atlasPath}" id="1_atlas"]

[sub_resource type="GDScript" id="GDScript_atlas"]
script/source = ${godotString(script)}

[node name="${sceneName}" type="Node2D"]
script = SubResource("GDScript_atlas")
atlas = ExtResource("1_atlas")
variant_index = 0
sprite_name = ${godotString(defaultId)}

[node name="Sprite2D" type="Sprite2D" parent="."]
centered = false

[node name="StaticBody2D" type="StaticBody2D" parent="."]

[node name="CollisionShape2D" type="CollisionShape2D" parent="StaticBody2D"]
`;
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderIndexImage(objects) {
  const canvas = document.createElement("canvas");
  canvas.width = state.img.width;
  canvas.height = state.img.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(state.img, 0, 0);

  const fontSize = 7;
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textBaseline = "bottom";

  objects.forEach((o, i) => {
    const r = rectOf(o);
    const marker = indexMarker(i);
    const tw = ctx.measureText(marker).width;

    let x = r.x - tw - 1;
    let y = r.y - 1;
    if (x < 0) x = r.x + 1;
    if (y < fontSize) y = r.y + fontSize + 1;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
    ctx.strokeText(marker, x, y);
    ctx.fillStyle = "#ffe566";
    ctx.fillText(marker, x, y);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("无法生成标注图片"));
    }, "image/png");
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function exportGodotScene() {
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

  const base = basename(state.imageName);
  const atlasFile = state.imageName || `${base}.png`;
  const defaultId = state.objects[0].id;
  const script = generateScript(state.objects);
  const tscn = generateTscn(script, atlasFile, defaultId);

  downloadBlob(new Blob([tscn], { type: "text/plain" }), `${base}.tscn`);
  await delay(200);
  const indexBlob = await renderIndexImage(state.objects);
  downloadBlob(indexBlob, `${base}_index.png`);
  markDirty(false);
}
