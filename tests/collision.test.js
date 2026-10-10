import test from "node:test";
import assert from "node:assert/strict";
import { collisionAABB, clampCollisionToRegion } from "../js/model.js";
import { generateObjectTscn } from "../js/godot-export.js";
import { SHAPE_RECT, SHAPE_ELLIPSE, SHAPE_CAPSULE } from "../js/constants.js";

function objectWithCollision(collision) {
  return {
    id: "OBJ_001", name: "test", top_left: { x: 0, y: 0 },
    bottom_right: { x: 64, y: 64 }, anchor: [.5, .5], collision,
  };
}

test("applying an even size at a half-pixel center keeps the exact size", () => {
  const collision = { shape: SHAPE_RECT, position: [16.5, 16.5], size: [32, 32] };
  clampCollisionToRegion(collision, 64, 64);
  assert.deepEqual(collision.size, [32, 32]);
  assert.deepEqual(collisionAABB(collision), { x: .5, y: .5, w: 32, h: 32 });
  assert.match(generateObjectTscn(objectWithCollision(collision), "res://atlas.png"), /size = Vector2\(32, 32\)/);
});

test("collision at region edge moves inside without growing", () => {
  const collision = { shape: SHAPE_RECT, position: [48.5, 48.5], size: [32, 32] };
  clampCollisionToRegion(collision, 64, 64);
  assert.deepEqual(collision.size, [32, 32]);
  assert.deepEqual(collision.position, [48, 48]);
});

test("ellipse scene uses the requested dimensions in its convex polygon", () => {
  const collision = { shape: SHAPE_ELLIPSE, position: [32, 32], size: [32, 20] };
  const scene = generateObjectTscn(objectWithCollision(collision), "res://atlas.png");
  assert.match(scene, /\[sub_resource type="ConvexPolygonShape2D"/);
  assert.match(scene, /points = PackedVector2Array\(16, 0, /);
  assert.match(scene, /, 0, 10, /);
  assert.match(scene, /position = Vector2\(0, 0\)/);
});

test("capsule scene dimensions derive from Size", () => {
  const collision = { shape: SHAPE_CAPSULE, position: [32, 32], size: [20, 32], radius: 5, height: 8 };
  const scene = generateObjectTscn(objectWithCollision(collision), "res://atlas.png");
  assert.match(scene, /radius = 10/);
  assert.match(scene, /height = 32/);
});

test("centered sprite has no offset and collision uses region center", () => {
  const object = objectWithCollision({ shape: SHAPE_RECT, position: [16, 40], size: [12, 20] });
  object.anchor = [0, 1];
  const scene = generateObjectTscn(object, "res://atlas.png");
  assert.match(scene, /\[node name="Sprite2D"[^\n]*\]\ncentered = true\ntexture =/);
  assert.doesNotMatch(scene, /^offset =/m);
  assert.match(scene, /position = Vector2\(-16, 8\)/);
});
