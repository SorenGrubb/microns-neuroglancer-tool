# -*- coding: utf-8 -*-
u"""The same questions, in three dimensions.                                             2026-09-30

Gary's Claude, relayed by Søren. The 2D descriptors carry over with real differences, and the
differences are the point:

    circularity  -> SPHERICITY, surface area against that of a sphere of the same volume. Two
                    conventions are in use and they are not the same number: Wadell's classic
                    π^(1/3)(6V)^(2/3)/S, and MorphoLibJ's 36πV²/S³, which is Wadell CUBED and so
                    spreads low values out. "You'll want µJump to state which convention it uses,
                    or the numbers won't line up with FIJI." Both are reported, each under its own
                    name with its formula in the column header, and a check asserts the exact cube
                    relation so neither can drift.
    aspect ratio -> ELONGATION (longest/middle axis) and FLATNESS (middle/shortest). This is the
                    biggest gain over 2D: a cigar-shaped mitochondrion and a pancake-shaped one can
                    be indistinguishable in one section, and a single 3D "aspect ratio" would hide
                    which it was.
    roundness    -> dropped in 3D. It was 1/aspect ratio in 2D and adds nothing here.
    solidity     -> carries over as V / V(convex hull), still the concavity detector. A torus keeps
                    a smooth surface but loses solidity to its hole, so sphericity and solidity
                    together flag the donut mitochondrion phenotype.

PHYSICAL UNITS, NOT VOXEL COUNTS. Gary's warning, and the one that would have bitten: in a
serial-section dataset the z step is many times the xy pixel, so metrics computed on voxel indices
report every organelle as elongated or flattened along z. Everything below is in µm from the
resolution the caller hands in. The check makes this an assertion rather than a promise — it builds
a true sphere at 1 µm xy and 10 µm z, which is a 10:1 rod in voxel counts, and requires elongation
and flatness to come back at 1.

SURFACE AREA FROM THE LOFTED MESH, not from voxel faces, which overestimate it — Gary again, and
it matters because sphericity is a ratio in which the surface is cubed. Volume comes from the same
mesh by the divergence theorem, so V and S describe one object; the Cavalieri volume is reported
beside it, and a disagreement between the two is visible rather than hidden.

MOMENTS OF THE WHOLE VOLUME, exactly, over the closed mesh: every triangle makes a tetrahedron with
the origin, and a tetrahedron's second moments are closed-form in barycentric coordinates. The
equivalent ellipsoid's semi-axes are sqrt(5λ) of the covariance eigenvalues, which is MorphoLibJ's
inertia-ellipsoid convention. Gary's caveat travels with it: these are moment ratios, not end-to-end
lengths, which is why a 5:1 rod does not score exactly 5.

AND FOR NUCLEI AND SOMA TOO -- "now I think about it these metrics will also be good for nuclei and
soma!" They already are: the sheet has always written a row per OUTLINED STRUCTURE, whatever its
kind, so a traced nucleus and a traced whole cell get every column an organelle gets. The only
thing they are excluded from is being named as another organelle's nearest neighbour, which is
right: a whole-cell outline encloses everything, so that distance would describe the tracing rather
than the cell.

Check: organelleshapecheck.js — a sphere, a 5:1 rod, a 5:1 disc, a torus and a single section,
all with answers that can be written down in advance.
Run: python3 src/the_same_questions_in_three_dimensions.py, then python3 src/build_stamps.py,
then, from inside wjump-build/, python3 build_wjump.py
"""
import io, os
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def edit(rel, pairs):
    P = os.path.join(HERE, rel)
    s = io.open(P, encoding="utf-8").read(); b = s
    for name, old, new in pairs:
        if new in s:
            print("  already there: " + name); continue
        n = s.count(old); assert n == 1, "%s (%s): %d" % (name, os.path.basename(P), n)
        s = s.replace(old, new, 1); print("  ok: " + name)
    if s != b: io.open(P, "w", encoding="utf-8").write(s)


D3 = u'''
  /* ── THE SAME QUESTIONS IN THREE DIMENSIONS ──────────────────────────────────  2026-09-30
     shape3d(rings, resNm) -> { ok, volumeUm3, surfaceUm2, hullVolumeUm3,
                                sphericityWadell, sphericityMorphoLibJ,
                                elongation, flatness, solidity3d, axesUm, sections }

     EVERYTHING IN µm, FROM resNm. In a serial-section dataset the z step is many times the xy
     pixel; metrics computed on voxel indices would report every organelle as elongated along z.
     See src/the_same_questions_in_three_dimensions.py.

     V AND S COME FROM THE SAME OBJECT -- the lofted mesh, which is closed. Voxel faces overestimate
     surface area, and sphericity cubes the surface, so the estimator matters more here than
     anywhere else in this file.

     TWO SPHERICITY CONVENTIONS, BOTH NAMED. Wadell π^(1/3)(6V)^(2/3)/S, MorphoLibJ 36πV²/S³ =
     Wadell³. Reporting one silently is how a number stops lining up with FIJI. */

  /* Eigenvalues of a symmetric 3x3, largest first. Analytic (Smith 1961) -- three eigenvalues do
     not need an iterative solver, and a solver that sometimes fails to converge is worse than a
     formula that never does. m = [xx, yy, zz, xy, xz, yz]. */
  function eig3(m){
    var xx = m[0], yy = m[1], zz = m[2], xy = m[3], xz = m[4], yz = m[5];
    var p1 = xy * xy + xz * xz + yz * yz;
    var q = (xx + yy + zz) / 3;
    if (p1 === 0) return [xx, yy, zz].sort(function(a, b){ return b - a; });
    var p2 = (xx - q) * (xx - q) + (yy - q) * (yy - q) + (zz - q) * (zz - q) + 2 * p1;
    var p = Math.sqrt(p2 / 6);
    var b00 = (xx - q) / p, b11 = (yy - q) / p, b22 = (zz - q) / p;
    var b01 = xy / p, b02 = xz / p, b12 = yz / p;
    var det = b00 * (b11 * b22 - b12 * b12) - b01 * (b01 * b22 - b12 * b02)
            + b02 * (b01 * b12 - b11 * b02);
    var r = det / 2;
    r = r < -1 ? -1 : (r > 1 ? 1 : r);
    var phi = Math.acos(r) / 3;
    var e1 = q + 2 * p * Math.cos(phi);
    var e3 = q + 2 * p * Math.cos(phi + 2 * Math.PI / 3);
    return [e1, 3 * q - e1 - e3, e3];
  }

  /* Incremental convex hull, returning its volume. Points are decimated first: a hull is decided
     by its extremes, and a thousand of them place it as well as ten thousand do. Returns 0 when the
     cloud is flat or degenerate, which the caller reads as "no solidity to report". */
  function hullVolume(P){
    var n = P.length / 3;
    if (n < 4) return 0;
    var stride = Math.max(1, Math.floor(n / 1200));
    var pts = [];
    for (var i = 0; i < n; i += stride) pts.push([P[i*3], P[i*3+1], P[i*3+2]]);
    if (pts.length < 4) return 0;
    var sub = function(a, b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; };
    var crs = function(a, b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; };
    var dot = function(a, b){ return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; };
    /* A starting tetrahedron: two extremes, then the point furthest from that line, then the point
       furthest from that plane. Picking the first four in order fails on any sorted input. */
    var i0 = 0, i1 = 0, k;
    for (k = 1; k < pts.length; k++){
      if (pts[k][0] < pts[i0][0]) i0 = k;
      if (pts[k][0] > pts[i1][0]) i1 = k;
    }
    if (i0 === i1) return 0;
    var d01 = sub(pts[i1], pts[i0]), i2 = -1, best = 0;
    for (k = 0; k < pts.length; k++){
      var c = crs(d01, sub(pts[k], pts[i0])), L = dot(c, c);
      if (L > best){ best = L; i2 = k; }
    }
    if (i2 < 0 || best <= 0) return 0;
    var nrm = crs(d01, sub(pts[i2], pts[i0])), i3 = -1; best = 0;
    for (k = 0; k < pts.length; k++){
      var h = Math.abs(dot(nrm, sub(pts[k], pts[i0])));
      if (h > best){ best = h; i3 = k; }
    }
    if (i3 < 0 || best <= 0) return 0;
    var faces = [];
    var add = function(a, b, c, inside){
      var nn = crs(sub(pts[b], pts[a]), sub(pts[c], pts[a]));
      if (dot(nn, sub(pts[inside], pts[a])) > 0){ var t = b; b = c; c = t;
        nn = crs(sub(pts[b], pts[a]), sub(pts[c], pts[a])); }
      faces.push([a, b, c, nn]);
    };
    add(i0, i1, i2, i3); add(i0, i1, i3, i2); add(i0, i2, i3, i1); add(i1, i2, i3, i0);
    /* THE TEST IS A DISTANCE, NOT A DOT PRODUCT.  2026-09-30
       It was an unnormalised dot against a fixed epsilon, and that works on scattered points and
       fails on exactly the input this is for. A face normal here has magnitude (edge length)², so
       at coordinates in nanometres it is ~4e8; floating noise on a point lying EXACTLY in a face's
       plane then comes out around 4, which sailed past an epsilon of 2e-4 and read as "outside".
       Traced contours are full of coplanar points -- they are stacked rings -- so face after face
       was torn out for points already on the hull, and the sphere came back with a hull a hundred
       times its own bounding box. Dividing by |n| makes it the real distance to the plane, and the
       epsilon is relative to the cloud's own size. Caught by organelleshapecheck.js. */
    var lo = [pts[0][0], pts[0][1], pts[0][2]], hi = [pts[0][0], pts[0][1], pts[0][2]];
    for (k = 1; k < pts.length; k++) for (var c3 = 0; c3 < 3; c3++){
      if (pts[k][c3] < lo[c3]) lo[c3] = pts[k][c3];
      if (pts[k][c3] > hi[c3]) hi[c3] = pts[k][c3];
    }
    var diag = Math.sqrt((hi[0]-lo[0])*(hi[0]-lo[0]) + (hi[1]-lo[1])*(hi[1]-lo[1])
                       + (hi[2]-lo[2])*(hi[2]-lo[2]));
    var eps = 1e-7 * (diag || 1);
    for (k = 0; k < pts.length; k++){
      var p = pts[k], vis = [], keep = [], f;
      for (var fi = 0; fi < faces.length; fi++){
        f = faces[fi];
        var nl = Math.sqrt(dot(f[3], f[3])) || 1;
        if (dot(f[3], sub(p, pts[f[0]])) / nl > eps) vis.push(f); else keep.push(f);
      }
      if (!vis.length) continue;
      /* The horizon: every edge of a visible face that a visible face does not share. */
      var cnt = {};
      vis.forEach(function(g){
        [[g[0], g[1]], [g[1], g[2]], [g[2], g[0]]].forEach(function(e){
          var key = e[0] < e[1] ? e[0] + "_" + e[1] : e[1] + "_" + e[0];
          if (cnt[key]) cnt[key].n++; else cnt[key] = { n: 1, a: e[0], b: e[1] };
        });
      });
      faces = keep;
      var interior = pts[i0], any = false;
      Object.keys(cnt).forEach(function(key){
        var e = cnt[key];
        if (e.n !== 1) return;
        var nn = crs(sub(pts[e.b], pts[e.a]), sub(p, pts[e.a]));
        if (!(dot(nn, nn) > 0)) return;
        /* Outward means away from the hull's inside; any interior point decides it, and the
           centroid of the seed tetrahedron is always inside. */
        var cen = [(pts[i0][0]+pts[i1][0]+pts[i2][0]+pts[i3][0])/4,
                   (pts[i0][1]+pts[i1][1]+pts[i2][1]+pts[i3][1])/4,
                   (pts[i0][2]+pts[i1][2]+pts[i2][2]+pts[i3][2])/4];
        var a = e.a, b = e.b;
        if (dot(nn, sub(cen, pts[a])) > 0){ var t = a; a = b; b = t;
          nn = crs(sub(pts[b], pts[a]), sub(p, pts[a])); }
        faces.push([a, b, k, nn]);
        any = true;
      });
      if (!any) return 0;
      interior = interior;
    }
    /* A HULL THAT IS NOT CLOSED HAS NO VOLUME, and a number computed from an open surface is
       worse than no number: every edge of a closed triangulation is shared by exactly two faces,
       so this refuses rather than reports. Solidity then reads blank in the sheet. */
    var edge = {}, openEdges = 0;
    faces.forEach(function(f){
      [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]].forEach(function(e){
        var key = e[0] < e[1] ? e[0] + "_" + e[1] : e[1] + "_" + e[0];
        edge[key] = (edge[key] || 0) + 1;
      });
    });
    Object.keys(edge).forEach(function(key){ if (edge[key] !== 2) openEdges++; });
    if (openEdges) return 0;
    var vol = 0;
    faces.forEach(function(f){
      var a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
      vol += dot(a, crs(b, c)) / 6;
    });
    return Math.abs(vol);
  }

  function shape3d(rings, resNm){
    var res = resNm || [1, 1, 1];
    var M;
    try { M = loft(rings, res); } catch (e){ return { ok: false, reason: "could not be lofted" }; }
    if (!M || !M.indices || M.indices.length < 12 || M.flat || M.sections < 2)
      return { ok: false, reason: "one section has no depth — trace it on at least two",
               sections: M ? M.sections : 0 };
    var P = M.positions, I = M.indices;
    /* Every triangle makes a tetrahedron with the origin. Signed, so the outside cancels and what
       is left is the solid -- holes included, which is what makes a torus come out as a torus. */
    var V = 0, S = 0, cx = 0, cy = 0, cz = 0;
    var mxx = 0, myy = 0, mzz = 0, mxy = 0, mxz = 0, myz = 0, t;
    for (t = 0; t < I.length; t += 3){
      var ia = I[t]*3, ib = I[t+1]*3, ic = I[t+2]*3;
      var ax = P[ia], ay = P[ia+1], az = P[ia+2];
      var bx = P[ib], by = P[ib+1], bz = P[ib+2];
      var gx = P[ic], gy = P[ic+1], gz = P[ic+2];
      var ux = bx-ax, uy = by-ay, uz = bz-az;
      var vx = gx-ax, vy = gy-ay, vz = gz-az;
      var nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
      S += Math.sqrt(nx*nx + ny*ny + nz*nz) / 2;
      var v6 = ax*(by*gz - bz*gy) - ay*(bx*gz - bz*gx) + az*(bx*gy - by*gx);
      var v = v6 / 6;
      V += v;
      cx += v * (ax+bx+gx) / 4; cy += v * (ay+by+gy) / 4; cz += v * (az+bz+gz) / 4;
      /* Barycentric: over a tetrahedron with one vertex at the origin,
         ∫ x_i x_j dV = v/20 · ( (Σ p_i)(Σ p_j) + Σ p_i p_j ). */
      var sx = ax+bx+gx, sy = ay+by+gy, sz = az+bz+gz;
      mxx += v * (sx*sx + ax*ax + bx*bx + gx*gx) / 20;
      myy += v * (sy*sy + ay*ay + by*by + gy*gy) / 20;
      mzz += v * (sz*sz + az*az + bz*bz + gz*gz) / 20;
      mxy += v * (sx*sy + ax*ay + bx*by + gx*gy) / 20;
      mxz += v * (sx*sz + ax*az + bx*bz + gx*gz) / 20;
      myz += v * (sy*sz + ay*az + by*bz + gy*gz) / 20;
    }
    var sgn = V < 0 ? -1 : 1;
    V *= sgn; cx *= sgn; cy *= sgn; cz *= sgn;
    mxx *= sgn; myy *= sgn; mzz *= sgn; mxy *= sgn; mxz *= sgn; myz *= sgn;
    if (!(V > 0) || !(S > 0)) return { ok: false, reason: "no enclosed volume", sections: M.sections };
    cx /= V; cy /= V; cz /= V;
    var Cxx = mxx/V - cx*cx, Cyy = myy/V - cy*cy, Czz = mzz/V - cz*cz,
        Cxy = mxy/V - cx*cy, Cxz = mxz/V - cx*cz, Cyz = myz/V - cy*cz;
    var ev = eig3([Cxx, Cyy, Czz, Cxy, Cxz, Cyz]);
    /* The equivalent ellipsoid: semi-axis = sqrt(5·eigenvalue), MorphoLibJ's inertia-ellipsoid
       convention. Moment ratios, NOT end-to-end lengths -- a 5:1 rod does not score exactly 5. */
    var a1 = Math.sqrt(Math.max(0, 5 * ev[0])) / 1000,
        a2 = Math.sqrt(Math.max(0, 5 * ev[1])) / 1000,
        a3 = Math.sqrt(Math.max(0, 5 * ev[2])) / 1000;
    var volUm3 = V / 1e9, surfUm2 = S / 1e6;
    var wadell = Math.pow(Math.PI, 1/3) * Math.pow(6 * volUm3, 2/3) / surfUm2;
    var hull = hullVolume(P) / 1e9;
    return { ok: true, sections: M.sections,
             volumeUm3: volUm3, surfaceUm2: surfUm2,
             sphericityWadell: Math.min(1, wadell),
             sphericityMorphoLibJ: Math.min(1, Math.pow(wadell, 3)),
             elongation: a2 > 0 ? a1 / a2 : null,
             flatness: a3 > 0 ? a2 / a3 : null,
             solidity3d: hull > 0 ? Math.min(1, volUm3 / hull) : null,
             hullVolumeUm3: hull > 0 ? hull : null,
             axesUm: [a1, a2, a3],
             centroidNm: [cx, cy, cz] };
  }
'''

edit("core/traceloft.js", [
 (u"the three-dimensional descriptors",
  u"  return { loft: loft, volume: volume, shape: shape,\n"
  u"           surfacePoints: surfacePoints, minSurfaceDistNm: minSurfaceDistNm,",
  D3 + u"\n  return { loft: loft, volume: volume, shape: shape, shape3d: shape3d,\n"
  u"           surfacePoints: surfacePoints, minSurfaceDistNm: minSurfaceDistNm,"),

 (u"...and the pieces a check reaches for",
  u"           _moments: moments, _perimeter: perimeter, _convexHull: convexHull, _describe: describe,",
  u"           _moments: moments, _perimeter: perimeter, _convexHull: convexHull, _describe: describe,\n"
  u"           _eig3: eig3, _hullVolume: hullVolume,"),
])
print("\nNow: node organelleshapecheck.js")
