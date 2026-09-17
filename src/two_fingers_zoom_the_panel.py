"""Two fingers zoom the 3D panel.                                                   2026-09-17

Søren, from a phone:

    *"It works well on mobile phone, however I want to have the option to zoom in or our in the 3D
    window by using 2 fingers."*

The panel's only zoom was the wheel. A phone has no wheel, so on a phone the model could be turned
and never approached -- and the one gesture everybody tries first did nothing at all.

TWO RENDERERS, THE SAME EDIT. core/mesh3d.js serves µJump, δJump, πJump, ηJump and βJump;
xjump_mesh.js is χJump's own, which predates the shared one and drives its assembly panel (its own
docstring explains why it was not folded in). The camera code in both is the same twenty lines, so
the fix is the same twenty lines, and it is applied to both here rather than in two places that
could drift.

HOW IT WORKS, and why each part is there:

  EVERY POINTER IS TRACKED, not just the first. That is the only way to notice a second one has
  arrived: `pointerdown` fires per pointer, and the handler that only remembered one had no way to
  tell a pinch from a drag.

  WITH TWO DOWN THE GESTURE IS A PINCH AND NOTHING ELSE. Rotation is suspended while it lasts, or
  the first finger's travel spins the model through every zoom -- which reads as a fault in the
  model rather than in the gesture.

  LIFTING BACK TO ONE FINGER RE-ANCHORS the rotation on the finger still down, at the angle the
  model is at now. Without that the model snaps round by however far that finger travelled during
  the pinch.

  THE CLAMP IS THE WHEEL'S CLAMP, 0.6 to 12. Neither way of zooming may reach somewhere the other
  cannot, or the panel behaves differently depending on which one you used last.

AND ONE THING THAT WAS ALREADY TRUE BUT NOT GUARANTEED: `.m3d-canvas{touch-action:none}` is what
lets the canvas see a second finger at all -- without it the browser takes the gesture for its own
page zoom. install() injects that stylesheet, so every tool reaching the panel through a "Show in
3D" button had it; a caller driving show() directly -- the tracing preview does -- was relying on
some other panel having been installed first. show() now asks for it itself. χJump's canvas gets
the same rule from build_xjump.py's own CSS, which has said why since it was written.

Run: python3 src/two_fingers_zoom_the_panel.py
     node m3dpinchcheck.js && node m3dcheck.js && node m3dlivecheck.js
     python3 build_xjump.py          # χJump inlines its renderer
"""
import io
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD_BLOCK = '''    var down = null;
    canvas.addEventListener("pointerdown", function(e){
      down = { x:e.clientX, y:e.clientY, yaw:view.yaw, pitch:view.pitch };
'''

NEW_HEAD = '''    /* ── ONE FINGER TURNS IT, TWO FINGERS ZOOM ────────────────────────────────────  2026-09-17
       Søren: *"It works well on mobile phone, however I want to have the option to zoom in or our
       in the 3D window by using 2 fingers."* A wheel is the only way to zoom this panel had, and a
       phone has no wheel -- so on a phone the model could be turned and never approached.

       Every pointer down on the canvas is tracked rather than just the first, because that is the
       only way to know a second one has arrived. With two down the gesture is a PINCH and nothing
       else: rotation is suspended while it lasts, or the first finger's travel would spin the model
       during every zoom, which feels like a fault in the model rather than in the gesture. Lifting
       back to one finger re-anchors the rotation where that finger IS, so the model does not jump
       by however far the pinch moved it.

       `touch-action:none` on the canvas is what lets any of this happen at all -- without it the
       browser takes the second finger for its own page zoom and the canvas never sees it.

       The wheel keeps working unchanged, and the two cannot interfere: a trackpad pinch arrives as
       a wheel event with ctrlKey, not as two pointers. */
    var down = null, touches = {}, nTouch = 0, pinch = null;
    function gap(){
      var ids = Object.keys(touches);
      if (ids.length < 2) return 0;
      var a = touches[ids[0]], b = touches[ids[1]];
      return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    }
    canvas.addEventListener("pointerdown", function(e){
      if (!touches[e.pointerId]) nTouch++;
      touches[e.pointerId] = { x:e.clientX, y:e.clientY };
      if (nTouch >= 2){
        down = null;                       // a pinch is not a drag, however it started
        pinch = { gap: gap() || 1, dist: view.dist };
      } else {
        down = { x:e.clientX, y:e.clientY, yaw:view.yaw, pitch:view.pitch };
      }
'''

MOVE_OLD = '''    canvas.addEventListener("pointermove", function(e){
      if (!down) return;
      view.yaw = down.yaw + (e.clientX - down.x) * 0.01;
'''
MOVE_NEW = '''    canvas.addEventListener("pointermove", function(e){
      if (touches[e.pointerId]) touches[e.pointerId] = { x:e.clientX, y:e.clientY };
      if (pinch && nTouch >= 2){
        var g = gap();
        if (g > 0){
          /* Fingers apart is closer, the way every map behaves. Clamped to the same range the
             wheel is, so neither way of zooming can reach somewhere the other cannot. */
          view.dist = Math.max(0.6, Math.min(12, pinch.dist * pinch.gap / g));
          paint();
        }
        return;
      }
      if (!down) return;
      view.yaw = down.yaw + (e.clientX - down.x) * 0.01;
'''

LIFT_OLD = '''    canvas.addEventListener("pointerup", function(){ down = null; });
    canvas.addEventListener("pointercancel", function(){ down = null; });
'''
LIFT_NEW = '''    function lift(e){
      if (touches[e.pointerId]){ delete touches[e.pointerId]; nTouch = Math.max(0, nTouch - 1); }
      if (nTouch < 2) pinch = null;
      if (nTouch === 1){
        /* RE-ANCHORED on the finger still down, at the angle the model is at now. Without this the
           model snaps back by the whole distance the remaining finger travelled during the pinch. */
        var id = Object.keys(touches)[0], t = touches[id];
        down = { x:t.x, y:t.y, yaw:view.yaw, pitch:view.pitch };
      } else if (nTouch === 0) down = null;
    }
    canvas.addEventListener("pointerup", lift);
    canvas.addEventListener("pointercancel", lift);
'''

CORE = [
    (OLD_BLOCK, NEW_HEAD, "core/mesh3d.js: a pinch is two pointers, not one"),
    (MOVE_OLD, MOVE_NEW, "core/mesh3d.js: two fingers move the camera, not the model"),
    (LIFT_OLD, LIFT_NEW, "core/mesh3d.js: lifting one finger re-anchors rather than jumping"),
    ('''  function show(host, geo, opts){
    var o = opts || {};
    if (!host) return null;
''',
     '''  function show(host, geo, opts){
    var o = opts || {};
    if (!host) return null;
    /* THE STYLESHEET IS NOT COSMETIC HERE, which is why show() now asks for it rather than trusting
       that install() ran. `.m3d-canvas{touch-action:none}` is what lets the canvas see a second
       finger at all -- without it the browser takes the gesture for its own page zoom, and the
       pinch added 2026-09-17 simply never fires. install() injects it, and every tool that reaches
       this panel through a "Show in 3D" button gets it that way; a caller that drives show()
       directly -- the tracing preview does -- had been relying on some OTHER panel having been
       installed first. Idempotent: it guards on its own element id. */
    injectStyle();
''',
     "core/mesh3d.js: show() injects the stylesheet the gesture depends on"),
]

# χJump's own renderer: the same three edits. Its pointerdown captures without a try/catch, which
# is its own choice and is left alone -- only the pinch is added.
XJUMP = [
    (OLD_BLOCK, NEW_HEAD, "xjump_mesh.js: a pinch is two pointers, not one"),
    (MOVE_OLD, MOVE_NEW, "xjump_mesh.js: two fingers move the camera, not the model"),
    (LIFT_OLD, LIFT_NEW, "xjump_mesh.js: lifting one finger re-anchors rather than jumping"),
]


def edit(rel, pairs):
    p = os.path.join(HERE, rel)
    s = io.open(p, encoding="utf-8").read()
    print(rel)
    for old, new, why in pairs:
        if new in s and (old not in s or old in new):
            print("  already there: " + why)
            continue
        assert not (new in s and old in s), "AMBIGUOUS: " + why
        assert old in s, "NOT FOUND: " + why
        assert s.count(old) == 1, "ambiguous (%d): %s" % (s.count(old), why)
        s = s.replace(old, new, 1)
        print("  ok: " + why)
    io.open(p, "w", encoding="utf-8").write(s)


edit("core/mesh3d.js", CORE)
edit("xjump_mesh.js", XJUMP)
print("\nnow: node m3dpinchcheck.js && node m3dcheck.js && node m3dlivecheck.js")
print("     python3 build_xjump.py      # χJump inlines its renderer")
