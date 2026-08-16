/* core/ontology.js -- extracted from ujump.html, stage 3 of the shared-core refactor (2026-08-16).
   The guided-identification ontology: the decision tree, leaf names, commonly-confused pairs,
   the leaf -> submission-name canonicalisation, the major-class family check, and the reference
   image library index.

   Fully dataset-agnostic -- a static free-variable check found ZERO external references. The 16
   leaf cell types are mammalian cortex types, so hJump (H01 human cortex) shares this file
   unchanged; only the reference images behind IMAGE_LIBRARY are per-dataset, and those are
   filenames resolved against the images data file the page loads.

   Everything stays a top-level `const`/`function`: top-level declarations are shared across
   classic <script> tags (see the scope note in ujump.html), so every existing call site in the
   page resolves exactly as before with no `window.` prefix and no call-site change.
   Do NOT also declare these names in the page -- a second `const TREE` anywhere would throw
   SyntaxError and silently kill that whole script block. */
window.UJ = window.UJ || {};
/* ---------- Guided identification ---------- */
const TREE={
 q1:{q:"Cortical location? (context only — sets priors, doesn't force a branch)",opts:[
   {label:"Layer 1",next:"q2"},{label:"Layers 2/3",next:"q2"},{label:"Layer 4",next:"q2"},
   {label:"Layer 5",next:"q2"},{label:"Layer 6",next:"q2"},{label:"White matter",next:"q2"},
   {label:"Leptomeninges",next:"lepto"},{label:"Not sure — skip",next:"q2"}]},
 lepto:{q:"Leptomeningeal compartment?",opts:[
   {label:"Part of the pia mater",next:"pia1"},
   {label:"Part of the arachnoid mater",next:"arach1"},
   {label:"Part of the dura mater",next:"dura1"},
   {label:"Part of the vasculature",next:"w1"},
   {label:"In the perivascular space",next:"p1"}]},
 pia1:{q:"Pia mater cell type — the pial fibroblast subtypes share one fibroblast ultrastructure and are separated mainly by location, not by a single-section EM feature (Pietilä et al. 2023).",opts:[
   {label:"Pia mater fibroblast — flat fibroblast forming the pia at the brain surface / glia limitans; elongated, RER-rich, collagen-associated, gap junctions, no tight junctions, no own basement membrane",leaf:"pia_mater_fibroblast"},
   {label:"Pial sheath fibroblast — same fibroblast ultrastructure, but ensheathing a penetrating vessel as it dives into cortex (the pial-glial / perivascular boundary)",leaf:"pial_sheath_fibroblast"}]},
 arach1:{q:"Arachnoid mater cell type — only the barrier cell has a real single-section EM signature (tight junctions); the arachnoid fibroblasts share the same fibroblast ultrastructure as the pial ones and are separated mainly by location (Pietilä et al. 2023).",opts:[
   {label:"Arachnoid barrier cell — epithelial-like cells joined by continuous tight + adherens junctions, forming the CSF–blood barrier; minimal collagen between them, no own basement membrane",leaf:"arachnoid_barrier_cell"},
   {label:"Inner arachnoid fibroblast — the same common leptomeningeal fibroblast type as the pia/pial-sheath fibroblasts, sitting deep to the barrier layer in the subarachnoid trabeculae",leaf:"inner_arachnoid_fibroblast"},
   {label:"Fibroblast reticular cell — reticular fibroblast in the subarachnoid trabeculae; closely related to / sometimes named \"inner arachnoid fibroblast\" (naming overlap)",leaf:"fibroblast_reticular_cell"}]},
 dura1:{q:"Dura mater cell type — the dural border cell is the outermost leptomeningeal fibroblast layer, sitting at the dura–arachnoid interface; it shares the same fibroblast ultrastructure as the pia/arachnoid fibroblasts and is distinguished mainly by location, not by a single-section EM feature (Pietilä et al. 2023).",opts:[
   {label:"Dural border cell — outermost leptomeningeal fibroblast, at the dura–arachnoid interface; elongated, RER-rich, collagen-associated, gap junctions, no tight junctions, no own basement membrane",leaf:"dural_border_cell"}]},
 q2:{q:"Where is the cell / how does it relate to the vasculature?",opts:[
   {label:"Free in vascular lumen",next:"l1"},{label:"Part of vessel wall",next:"w1"},
   {label:"Perivascular space",next:"p1"},{label:"Parenchyma (brain tissue proper)",next:"n1"},
   {label:"Leptomeninges — at the brain surface (pia / arachnoid / subarachnoid space)",next:"lepto"}]},
 l1:{q:"Nucleus present?",opts:[
   {label:"No nucleus — homogeneous dense, hemoglobin, biconcave/dumbbell, ~5.8µm (mouse RBC; smaller than the ~7.3µm human cell)",leaf:"erythrocyte"},
   {label:"No nucleus — 2–4µm fragment, alpha + dense granules, marginal MT band",leaf:"platelet"},
   {label:"Has nucleus (leukocyte)",next:"l2"}]},
 l2:{q:"Nuclear shape / granules?",opts:[
   {label:"Ring/band-shaped or 3–5-lobed nucleus (mouse neutrophils are frequently ring-shaped) + multiple granule populations",leaf:"neutrophil"},
   {label:"Very high N:C ratio, thin cytoplasm rim, round dense nucleus, few organelles",leaf:"lymphocyte"},
   {label:"Largest; kidney-bean nucleus, pale lacy chromatin, Golgi in nuclear fold",leaf:"monocyte"}]},
 w1:{q:"Lines the lumen? (tight + adherens junctions, caveolae, flat nucleus bending around lumen)",opts:[
   {label:"Yes — closest cell to lumen",leaf:"endothelial_cell"},
   {label:"No — abluminal, enclosed in basement membrane",next:"w2"}]},
 w2:{q:"Vessel type / orientation?",opts:[
   {label:"Capillary; bump-on-a-log, thin processes, shares endothelial BM",leaf:"pericyte"},
   {label:"Arteriole; circumferential, contractile elements (myofilaments + dense bodies); elastic lamina thin/variable on small cortical arterioles",leaf:"smooth_muscle_cell"},
   {label:"Venule; pericyte-like — bump-on-a-log, thin processes — on a venule",leaf:"venular_smooth_muscle_pericyte"}]},
 /* Pericyte subtyping (ensheathing / mesh / thin-strand), added at Søren's request. Deliberately
    OPTIONAL: the last option keeps the plain "Pericyte" leaf, so nobody is forced to subtype a cell
    whose 3D morphology or branch position isn't clear enough to call. That escape hatch matters
    more here than elsewhere in this tree, because these three are ends of a continuum rather than
    discrete classes -- Søren's own review argues the transitional mural cells are better described
    as simply "contractile" vs "noncontractile", since morphology grades smoothly from arteriolar
    smooth muscle through to thin-strand pericytes (Grubb 2023, Vascular Biology). The criteria
    below are drawn from 3D/ultrastructural sources rather than invented: Grant et al. 2019 (JCBFM)
    established the three-way naming and the branch-order zones from in vivo optical imaging;
    Abdelazim et al. 2022 (Front. Physiol.) is the one that matters most for this tool, because it
    tested those same categories against serial block-face SEM and reported which features actually
    separate them in volume EM -- circumferential coverage, cross-sectional area shared with the
    endothelium, peg-and-socket density, and an ECM feature unique to ensheathing pericytes. */
 w2p:{q:"Pericyte subtype from 3D shape and position along the vessel? (optional — pick the last option to leave it as a plain pericyte)",opts:[
   {label:"Ensheathing — near the arteriole→capillary transition (roughly 1st–4th order branch off a penetrating arteriole, often at/just past a precapillary sphincter); processes wrap circumferentially and cover most of the vessel circumference; largest shared area with the endothelium; frequently a separate contractile mural cell sandwiched between it and the endothelium; radial \"blade-like\" basement-membrane extensions into the parenchyma are unique to this subtype",leaf:"pericyte_ensheathing"},
   {label:"Mesh — true capillary zone, downstream of the transition; short, branching, interconnecting processes forming a mesh-like net around the vessel; intermediate circumferential coverage — more of the vessel surface covered than thin-strand, clearly less than ensheathing",leaf:"pericyte_mesh"},
   {label:"Thin-strand — mid/high-order capillary; classic \"bump-on-a-log\" ovoid soma with one or two long, thin, unbranched strands running ALONG the vessel axis, narrowing as they go; lowest circumferential coverage and lowest shared area with the endothelium; peg-and-socket contacts prominent",leaf:"pericyte_thin_strand"},
   {label:"Not sure / don't subtype — record it as a plain pericyte",leaf:"pericyte"}]},
 p1:{q:"What best describes this cell in the perivascular space?",opts:[
   {label:"Large dense heterolysosomes/phagosomes, lipid + lipofuscin, blunt pseudopods",leaf:"perivascular_macrophage"},
   {label:"Elongated, RER-rich, flanked by collagen fibrils, no own BM",leaf:"perivascular_fibroblast"},
   {label:"Dendritic cell — criteria TBD (no peer-reviewed EM source pinned down yet; placeholder)",leaf:"dendritic_cell"},
   {label:"Leukocyte morphology (has nucleus, blood-cell-like — incl. around leptomeninges)",next:"l2"}]},
 n1:{q:"Neuron or glia?",opts:[
   {label:"Neuron — large pale euchromatic nucleus, owl-eye nucleolus, Nissl substance, prominent Golgi, receives synapses, primary cilium",next:"ne2"},
   {label:"Glia — smaller nucleus relative to cell size, more heterochromatin (darker nucleus on EM), less prominent or absent \"owl-eye\" nucleolus, less abundant rough ER (no obvious Nissl substance), simpler Golgi apparatus",next:"g1"}]},
 ne2:{q:"Synapses its axon makes (or somatic proxies)?",opts:[
   {label:"Asymmetric (Gray I), round vesicles, thick PSD; spiny dendrites + apical dendrite, pyramidal soma → excitatory",next:"ne_exc"},
   {label:"Symmetric (Gray II), flat/pleomorphic vesicles, thin PSD; aspiny, indented nucleus, dense somatic synapses → inhibitory",next:"ne_inh"}]},
 ne_exc:{q:"Which excitatory subtype? MICrONS excitatory subtypes are set by cortical layer + 3-D dendritic shape (apical trunk, tuft, soma size), reconstructed from the full segmentation — a single TEM section usually can't resolve them, and the morphology is largely a continuum with only a few sharp exceptions in layers 5–6 (Weis et al. 2025). Use the predicted layer shown above as your main cue and pick the closest fit.",opts:[
   {label:"Upper cortex (L2/3): one spiny apical dendrite rising to L1 with a modest tuft; arbor width & tuft shrink with depth (IT-projecting)",leaf:"exc_l23_it"},
   {label:"Layer 4: small soma, weak or absent apical dendrite (spiny-stellate / star-pyramid), locally-branching spiny dendrites; thalamo-recipient",leaf:"exc_l4"},
   {label:"Layer 5, large soma: THICK apical trunk with a prominent L1 tuft + extensive basal/oblique dendrites; thick myelinated axon to white matter (thick-tufted, ET)",leaf:"exc_l5_et"},
   {label:"Layer 5, moderate soma: slender apical dendrite with a thinner/weaker tuft (intratelencephalic, IT)",leaf:"exc_l5_it"},
   {label:"Layer 5: sparse dendritic arbor with little or no apical tuft (near-projecting, NP)",leaf:"exc_l5_np"},
   {label:"Layer 6: tall, narrow, upright apical dendrite reaching up toward L4/upper layers (corticothalamic, CT)",leaf:"exc_l6_ct"},
   {label:"Layer 6: shorter apical dendrite, diverse forms incl. horizontal/inverted (intratelencephalic, IT — can be hard to separate from 6P-CT)",leaf:"exc_l6_it"}]},
 ne_inh:{q:"Which inhibitory subtype? MICrONS inhibitory subtypes are defined mainly by where the axon places its synapses (Schneider-Mizell et al. 2025), so a full axon reconstruction / connectivity is usually needed — nucleus & soma ultrastructure alone separates the broad subclasses to ~90% (Elabbady et al. 2025). Match the axonal/dendritic pattern below.",opts:[
   {label:"Dense LOCAL axon studding somata & proximal dendrites with perisomatic boutons; multipolar dendrites (perisomatic-targeting ≈ PV basket)",leaf:"inh_basket"},
   {label:"Axon ASCENDS to layer 1 and arborizes there, targeting distal apical dendrites; soma in L2/3–L5 (distal-targeting ≈ SST Martinotti)",leaf:"inh_martinotti"},
   {label:"Vertical bipolar / bitufted dendrites; axon preferentially targets OTHER interneurons (inhibitory-targeting, disinhibitory ≈ VIP bipolar)",leaf:"inh_bipolar"},
   {label:"Small round soma with a dense, fine, short-range axonal cloud; enriched in layer 1; sparse / volume-transmission targeting (≈ neurogliaform)",leaf:"inh_neurogliaform"}]},
 g1:{q:"Cytoplasmic density + contents + cilium?",opts:[
   {label:"Electron-lucent (pale) cytoplasm — paler than the darker oligodendrocyte; glycogen granules, 10-nm GFAP intermediate-filament bundles, irregular/angular nucleus with sparse chromatin, perivascular endfeet, gap junctions, primary cilium; spongy space-filling 3D territory",leaf:"astrocyte"},
   {label:"Scant dark cytoplasm, elongated dense nucleus w/ peripheral heterochromatin band, large dense lysosomes, NO cilium",leaf:"microglia"},
   {label:"Dark round, clumped heterochromatin, MT-rich (no IF/glycogen), continuous w/ myelin, NO cilium, in rows",leaf:"oligodendrocyte"},
   {label:"Intermediate density, indented nucleus, centrioles + primary cilium, sparse organelles, receives synapses",leaf:"opc"}]}
};
/* Commonly-confused-with warnings for the guided identification result screen. Deliberately
   conservative: only pairs with a real, checkable basis are included (a trusted source per
   Søren\'s "never cite something not backed by a paper" rule), everything else is left out
   rather than guessed. "note" is the specific ultrastructural overlap that causes the confusion;
   "ref"/"refLabel" point to a source the user can actually check. */
const CONFUSED_WITH={
  pericyte:{withName:"Smooth muscle cell / Venular smooth muscle cell",note:"All three are mural cells distinguished mainly by vessel branch order and morphology (bump-on-a-log vs circumferential rings), not a single fixed ultrastructural marker \u2014 see the pericyte/endothelial organization study this tool\'s mural-cell split is based on.",ref:"https://doi.org/10.1101/2025.11.19.689283",refLabel:"Grubb et al., bioRxiv 2025"},
  smooth_muscle_cell:{withName:"Pericyte / Venular smooth muscle cell",note:"Distinguished from pericytes mainly by vessel branch order (arteriole vs capillary) rather than a single fixed marker.",ref:"https://doi.org/10.1101/2025.11.19.689283",refLabel:"Grubb et al., bioRxiv 2025"},
  venular_smooth_muscle_pericyte:{withName:"Pericyte",note:"Sits on the venous side at a branch order where pericyte- and smooth-muscle-like morphology overlap.",ref:"https://doi.org/10.1101/2025.11.19.689283",refLabel:"Grubb et al., bioRxiv 2025"},
  endothelial_cell:{withName:"Pericyte",note:"A thin pericyte process running along the vessel wall can resemble endothelium in cross-section; check which side of the shared basement membrane the cell sits on.",ref:"https://doi.org/10.1101/2025.11.19.689283",refLabel:"Grubb et al., bioRxiv 2025"},
  perivascular_macrophage:{withName:"Microglia / Perivascular fibroblast",note:"Both perivascular macrophages and microglia carry heterogeneous lysosomes/lipofuscin; location (perivascular space vs parenchyma) and phagolysosome pattern are the more reliable cues.",ref:"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7930431/",refLabel:"PMC7930431"},
  microglia:{withName:"Perivascular macrophage",note:"Shares dense lysosomes and a similarly dark, scant cytoplasm; parenchymal location (isolated by astrocyte endfeet) vs the perivascular space is the more reliable cue.",ref:"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7930431/",refLabel:"PMC7930431"},
  opc:{withName:"Oligodendrocyte",note:"Both have intermediate cytoplasmic density; OPCs keep a primary cilium/centrioles and receive bona fide synapses, which mature oligodendrocytes generally lack.",ref:"http://www.drjastrow.de/WAI/EM/EMAtlas.html",refLabel:"Dr. Jastrow\'s EM Atlas"},
  oligodendrocyte:{withName:"OPC",note:"Both have intermediate cytoplasmic density; look for continuity with myelin internodes (oligodendrocyte) vs a primary cilium and thin radial processes (OPC).",ref:"http://www.drjastrow.de/WAI/EM/EMAtlas.html",refLabel:"Dr. Jastrow\'s EM Atlas"},
  inh_basket:{withName:"Excitatory (layer 5) neuron",note:"The broad MICrONS classifier (soma/nucleus ultrastructure only) sometimes misclassifies layer 5 inhibitory neurons as excitatory; the fine m-type call is more reliable here.",ref:"https://doi.org/10.1038/s41586-024-07765-7",refLabel:"Elabbady et al., Nature 2025"},
  inh_martinotti:{withName:"Excitatory (layer 5) neuron",note:"The broad MICrONS classifier can misclassify layer 5 inhibitory neurons as excitatory based on soma/nucleus shape alone; the fine m-type call is more reliable here.",ref:"https://doi.org/10.1038/s41586-024-07765-7",refLabel:"Elabbady et al., Nature 2025"},
  dendritic_cell:{withName:"Perivascular macrophage",note:"Both are perivascular immune cells with overlapping ultrastructure; dendritic cells are far rarer, so a confident call benefits from a second opinion.",ref:"https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7930431/",refLabel:"PMC7930431"}
};
const LEAF_NAMES={erythrocyte:"Erythrocyte",platelet:"Platelet",neutrophil:"Neutrophil",lymphocyte:"Lymphocyte",monocyte:"Monocyte",endothelial_cell:"Endothelial cell",pericyte:"Pericyte",smooth_muscle_cell:"Smooth muscle cell",venular_smooth_muscle_pericyte:"Venular smooth muscle cell",perivascular_macrophage:"Perivascular macrophage",perivascular_fibroblast:"Perivascular fibroblast",dendritic_cell:"Dendritic cell",excitatory_neuron:"Excitatory neuron",inhibitory_neuron:"Inhibitory neuron",exc_l23_it:"L2/3 pyramidal neuron (23P)",exc_l4:"Layer 4 pyramidal / spiny-stellate neuron (4P)",exc_l5_it:"Layer 5 IT pyramidal neuron (5P-IT)",exc_l5_et:"Layer 5 ET thick-tufted pyramidal neuron (5P-ET)",exc_l5_np:"Layer 5 near-projecting neuron (5P-NP)",exc_l6_it:"Layer 6 IT pyramidal neuron (6P-IT)",exc_l6_ct:"Layer 6 CT pyramidal neuron (6P-CT)",inh_basket:"Basket cell — PV / perisomatic-targeting (BC)",inh_martinotti:"Martinotti cell — SST / distal-targeting (MC)",inh_bipolar:"Bipolar cell — VIP / inhibitory-targeting (BPC)",inh_neurogliaform:"Neurogliaform cell — sparsely-targeting (NGC)",astrocyte:"Astrocyte",microglia:"Microglia",oligodendrocyte:"Oligodendrocyte",opc:"OPC",pia_mater_fibroblast:"Pia mater fibroblast",pial_sheath_fibroblast:"Pial sheath fibroblast",arachnoid_barrier_cell:"Arachnoid barrier cell",fibroblast_reticular_cell:"Fibroblast reticular cell",inner_arachnoid_fibroblast:"Inner arachnoid fibroblast",dural_border_cell:"Dural border cell"};
/* Canonicalizes a guided-ID leaf's DISPLAY name (LEAF_NAMES[slug], sentence case, sometimes with
   an added qualifying word like "Perivascular") into the exact string used as the TYPE-BUCKET key
   everywhere else in this app -- Søren's own-verified dataset (OWN_TYPE_NAMES, embedded above),
   the Master List's current_identity column, and the Dashboard's live per-type aggregation. 4 leaf
   display names don't literally match their canonical own-verified string: 3 differ only in the
   capitalization of "fibroblast" ("Perivascular Fibroblast"/"Pia mater Fibroblast"/"Pial sheath
   Fibroblast" are the real OWN_TYPE_NAMES strings; the leaf labels use sentence-case "fibroblast"
   instead -- fine as on-screen text, but a DIFFERENT string to an exact-match spreadsheet lookup),
   and "Perivascular macrophage" collapses to the broader canonical "Macrophage" bucket (there is
   no separate "Perivascular macrophage" type in the verified dataset -- COMM_TO_ROWTYPE already
   encodes this exact correction for client-side filtering, just never applied at submission time).
   Root cause of Søren's 2026-08-08 report: "Perivascular fibroblast[s]"/"Pia mater fibroblast[s]"
   each showing up TWICE on the dashboard's "Cells per cell type"/cilia-percent-by-type charts --
   every guided-ID submission through one of these leaves was posting the mismatched display
   string verbatim as `identified`, so it landed in the Master List/live-aggregation as its own
   separate, differently-cased bucket holding only that handful of community reports. Apply this
   ONLY when constructing the `identified`/`type` field of a report payload (postReport) -- never
   for on-screen text, where the leaf's own wording (with its extra context, e.g. "Perivascular")
   is clearer to a reader than the bare canonical type name. */
const LEAF_SUBMIT_CANON={"Perivascular fibroblast":"Perivascular Fibroblast","Pia mater fibroblast":"Pia mater Fibroblast","Pial sheath fibroblast":"Pial sheath Fibroblast","Perivascular macrophage":"Macrophage"};
function canonSubmitName(nm){return nm?(LEAF_SUBMIT_CANON[nm]||nm):nm;}
/* Coarse cell-type "family" buckets -- 2026-08-09, undo/restore feature (Søren's example: "a
   neuron was accidentally reclassified as an endothelial cell instead of a nearby pericyte" --
   neuron -> endothelial crosses a family boundary that pericyte -> endothelial doesn't quite as
   badly, but ANY cross-family jump is exactly the class of accidental misclick this is meant to
   catch). Deliberately KEYWORD-based rather than a lookup keyed on the 16 leaf slugs: the actual
   string compared here is whatever's currently on screen as the "previous" identity (a MICrONS
   suggestion, a community vote, or a free-text override), which doesn't always match a leaf slug
   verbatim (different casing, spacing, or a name that predates a later leaf rename) -- a
   substring match against normalized (lowercased, underscores->spaces) text is far more robust to
   that than an exact map would be. Order matters where a name could match more than one keyword
   set (there isn't one today, but if a future leaf name did, the first matching family wins). */
const CLASS_FAMILY_KEYWORDS=[
  {family:"neuron",kws:["neuron","interneuron","pyramidal"]},
  {family:"vascular",kws:["endothelial","pericyte","smooth muscle","mural"]},
  {family:"perivascular",kws:["perivascular","fibroblast"]},
  {family:"blood",kws:["erythrocyte","platelet"]},
  {family:"circulating immune",kws:["neutrophil","lymphocyte","monocyte"]},
  {family:"glial",kws:["astrocyte","oligodendrocyte","opc","precursor cell"]},
  {family:"resident immune",kws:["microglia"]}
];
function familyOf(nameStr){
  if(!nameStr)return null;
  const s=String(nameStr).toLowerCase().replace(/_/g," ");
  for(const grp of CLASS_FAMILY_KEYWORDS){
    if(grp.kws.some(k=>s.indexOf(k)>=0))return grp.family;
  }
  return null;
}
/* Shown as a native confirm() dialog right before a reclassification that crosses a family
   boundary (see familyOf() above) actually posts -- cheap, unmissable, blocking, and needs no new
   UI: exactly what "confirmation dialog for major class changes" calls for. Returns true if the
   submission should proceed (no family change, families unknown/unclassified so nothing to
   compare, or the user confirmed), false if the user backed out. */
function confirmMajorClassChange(oldName,newName){
  const oldFam=familyOf(oldName),newFam=familyOf(newName);
  if(!oldFam||!newFam||oldFam===newFam)return true;
  return confirm("This changes the cell's category from "+oldFam+" (“"+oldName+"”) to "+newFam+" (“"+newName+"”) — a major reclassification, not just a nearby subtype.\n\nDouble-check this against the ultrastructure before submitting. Continue?");
}
// Real files currently sitting in the image library folders (matches what's on disk today).
// coord is [x,y,z] in VOXELS, filled in from the catalog's Notes/coordinate column.
// Left null until supplied -- thumbnails without a coord show greyed-out with no jump link.
const IMAGE_LIBRARY={
 erythrocyte:{dir:"A_free_in_lumen/erythrocyte",files:[
   {file:"erythrocyte_01_TEM.png",mod:"TEM",coord:[317351,100655,17661]},{file:"erythrocyte_02_TEM.png",mod:"TEM",coord:[317326,100653,17649]},{file:"erythrocyte_03_TEM.png",mod:"TEM",coord:[317449,100779,17690]}]},
 platelet:{dir:"A_free_in_lumen/platelet",files:[
   {file:"platelet_01_TEM.png",mod:"TEM",coord:[325027,83268,18723]},{file:"platelet_02_TEM.png",mod:"TEM",coord:[324948,83291,18713]},{file:"platelet_03_TEM.png",mod:"TEM",coord:[324852,83287,18707]}]},
 neutrophil:{dir:"A_free_in_lumen/neutrophil",files:[]},
 lymphocyte:{dir:"A_free_in_lumen/lymphocyte",files:[
   {file:"lymphocyte_01_TEM.png",mod:"TEM",coord:[328719,80697,9480]},{file:"lymphocyte_02_TEM.png",mod:"TEM",coord:[172822,79160,24793]},{file:"lymphocyte_03_TEM.png",mod:"TEM",coord:[328641,80580,9491]},{file:"lymphocyte_04_TEM.png",mod:"TEM",coord:[186566,88000,17033]}]},
 monocyte:{dir:"A_free_in_lumen/monocyte",files:[
   {file:"monocyte_01_TEM.png",mod:"TEM",coord:[209931,199836,11207]},{file:"monocyte_02_TEM.png",mod:"TEM",coord:[209682,199989,11149]},{file:"monocyte_03_TEM.png",mod:"TEM",coord:[209545,199772,11185]}]},
 endothelial_cell:{dir:"B_vessel_wall/endothelial_cell",files:[
   {file:"endothelial_cell_01_TEM.png",mod:"TEM",coord:[230448,149883,22331]},{file:"endothelial_cell_02_TEM.png",mod:"TEM",coord:[231345,149488,22333]},{file:"endothelial_cell_03_TEM.png",mod:"TEM",coord:[220965,85534,19366]},{file:"endothelial_cell_04_TEM.png",mod:"TEM",coord:[220205,84935,19357]}]},
 smooth_muscle_cell:{dir:"B_vessel_wall/smooth_muscle_cell",files:[
   {file:"smooth_muscle_cell_01_TEM.png",mod:"TEM",coord:[175543,122612,19403]},{file:"smooth_muscle_cell_02_TEM.png",mod:"TEM",coord:[173885,123049,19492]},{file:"smooth_muscle_cell_03_TEM.png",mod:"TEM",coord:[173720,122947,19488]},{file:"smooth_muscle_cell_04_TEM.png",mod:"TEM",coord:[174968,121555,19461]},{file:"smooth_muscle_cell_05_3D.png",mod:"3D",coord:[175478,122712,19420]}]},
 pericyte:{dir:"B_vessel_wall/pericyte",files:[
   {file:"pericyte_01_TEM.png",mod:"TEM",coord:[351380,207262,22964]},{file:"pericyte_02_TEM.png",mod:"TEM",coord:[351303,207251,22949]},{file:"pericyte_03_TEM.png",mod:"TEM",coord:[351737,206421,23030]},{file:"pericyte_04_3D.png",mod:"TEM",coord:[352695,205803,23033]},{file:"pericyte_05_3D.png",mod:"3D",coord:[351275,206523,22974]}]},
 pericyte_ensheathing:{dir:"B_vessel_wall/pericyte_ensheathing",files:[]},
 pericyte_mesh:{dir:"B_vessel_wall/pericyte_mesh",files:[]},
 pericyte_thin_strand:{dir:"B_vessel_wall/pericyte_thin_strand",files:[]},
 venular_smooth_muscle_pericyte:{dir:"B_vessel_wall/venular_smooth_muscle_pericyte",files:[]},
 perivascular_macrophage:{dir:"C_perivascular_space/perivascular_macrophage",files:[
   {file:"perivascular_macrophage_01_TEM.png",mod:"TEM",coord:[174365,169750,19509]},{file:"perivascular_macrophage_02_TEM.png",mod:"TEM",coord:[174339,170797,19507]},{file:"perivascular_macrophage_03_TEM.png",mod:"TEM",coord:[172784,172062,19597]},{file:"perivascular_macrophage_04_TEM.png",mod:"TEM",coord:[171898,170943,19559]},{file:"perivascular_macrophage_05_3D.png",mod:"3D",coord:[173741,170125,19591]}]},
 perivascular_fibroblast:{dir:"C_perivascular_space/perivascular_fibroblast",files:[
   {file:"perivascular_fibroblast_01_TEM.png",mod:"TEM",coord:[148912,194263,17139]},{file:"perivascular_fibroblast_02_TEM.png",mod:"TEM",coord:[147728,193980,17100]},{file:"perivascular_fibroblast_03_TEM.png",mod:"TEM",coord:[149783,195334,17130]},{file:"perivascular_fibroblast_04_TEM.png",mod:"TEM",coord:[148660,194806,17104]},{file:"perivascular_fibroblast_05_3D.png",mod:"3D",coord:[147394,193443,17111]}]},
 dendritic_cell:{dir:"C_perivascular_space/dendritic_cell",files:[]},
 excitatory_neuron:{dir:"D_parenchyma_neurons/excitatory_neuron",files:[
   {file:"excitatory_neuron_03_TEM.png",mod:"TEM",coord:[265015,189269,18101]},{file:"excitatory_neuron_04_3D.png",mod:"3D",coord:[265015,189269,18101]},{file:"excitatory_neuron_05_3D.png",mod:"3D",coord:[265015,189269,18101]}]},
 inhibitory_neuron:{dir:"D_parenchyma_neurons/inhibitory_neuron",files:[
   {file:"inhibitory_neuron_03_TEM.png",mod:"TEM",coord:[262339,189412,17839]},{file:"inhibitory_neuron_04_3D.png",mod:"3D",coord:[262339,189412,17839],root:"864691135163623469"},{file:"inhibitory_neuron_05_3D.png",mod:"3D",coord:[262339,189412,17839],root:"864691135163623469"}]},
 exc_l23_it:{dir:"D_parenchyma_neurons/excitatory_neuron/exc_l23_it",files:[]},
 exc_l4:{dir:"D_parenchyma_neurons/excitatory_neuron/exc_l4",files:[]},
 exc_l5_it:{dir:"D_parenchyma_neurons/excitatory_neuron/exc_l5_it",files:[]},
 exc_l5_et:{dir:"D_parenchyma_neurons/excitatory_neuron/exc_l5_et",files:[]},
 exc_l5_np:{dir:"D_parenchyma_neurons/excitatory_neuron/exc_l5_np",files:[]},
 exc_l6_it:{dir:"D_parenchyma_neurons/excitatory_neuron/exc_l6_it",files:[]},
 exc_l6_ct:{dir:"D_parenchyma_neurons/excitatory_neuron/exc_l6_ct",files:[]},
 inh_basket:{dir:"D_parenchyma_neurons/inhibitory_neuron/inh_basket",files:[]},
 inh_martinotti:{dir:"D_parenchyma_neurons/inhibitory_neuron/inh_martinotti",files:[]},
 inh_bipolar:{dir:"D_parenchyma_neurons/inhibitory_neuron/inh_bipolar",files:[]},
 inh_neurogliaform:{dir:"D_parenchyma_neurons/inhibitory_neuron/inh_neurogliaform",files:[]},
 astrocyte:{dir:"E_parenchyma_glia/astrocyte",files:[
   {file:"astrocyte_01_TEM.png",mod:"TEM",coord:[202245,91114,24443]},{file:"astrocyte_02_TEM.png",mod:"TEM",coord:[201959,90406,24435]},{file:"astrocyte_03_TEM.png",mod:"TEM",coord:[201458,90996,24407]},{file:"astrocyte_04_3D.png",mod:"3D",coord:[202245,91114,24443]},{file:"astrocyte_05_3D.png",mod:"3D",coord:[202245,91114,24443]}]},
 microglia:{dir:"E_parenchyma_glia/microglia",files:[
   {file:"microglia_01_TEM.png",mod:"TEM",coord:[223862,144625,23876],root:"864691135992500360"},{file:"microglia_02_TEM.png",mod:"TEM",coord:[223965,144608,23854],root:"864691135992500360"},{file:"microglia_03_TEM.png",mod:"TEM",coord:[224380,144267,23873],root:"864691135992500360"},{file:"microglia_04_3D.png",mod:"3D",coord:[224042,144609,23852],root:"864691135992500360"}]},
 oligodendrocyte:{dir:"E_parenchyma_glia/oligodendrocyte",files:[
   {file:"oligodendrocyte_01_TEM.png",mod:"TEM",coord:[214734,238819,18378]},{file:"oligodendrocyte_02_TEM.png",mod:"TEM",coord:[214440,239193,18347]},{file:"oligodendrocyte_04_TEM.png",mod:"TEM",coord:[214616,239130,18384]},{file:"oligodendrocyte_05_3D.png",mod:"3D",coord:[214295,239332,18362]}]},
 opc:{dir:"E_parenchyma_glia/opc",files:[
   {file:"opc_01_TEM.png",mod:"TEM",coord:[144893,202304,18101]},{file:"opc_02_TEM.png",mod:"TEM",coord:[144468,202446,18071]},{file:"opc_04_TEM.png",mod:"TEM",coord:[145054,201800,18077]},{file:"opc_05_3D.png",mod:"3D",coord:[145722,201943,18136]}]},
 pia_mater_fibroblast:{dir:"F_leptomeninges/pia_mater_fibroblast",files:[]},
 pial_sheath_fibroblast:{dir:"F_leptomeninges/pial_sheath_fibroblast",files:[]},
 arachnoid_barrier_cell:{dir:"F_leptomeninges/arachnoid_barrier_cell",files:[]},
 fibroblast_reticular_cell:{dir:"F_leptomeninges/fibroblast_reticular_cell",files:[]},
 inner_arachnoid_fibroblast:{dir:"F_leptomeninges/inner_arachnoid_fibroblast",files:[]},
 dural_border_cell:{dir:"F_leptomeninges/dural_border_cell",files:[]}
};

UJ.ontology = {
  TREE: TREE, LEAF_NAMES: LEAF_NAMES, CONFUSED_WITH: CONFUSED_WITH,
  IMAGE_LIBRARY: IMAGE_LIBRARY, canonSubmitName: canonSubmitName,
  familyOf: familyOf, confirmMajorClassChange: confirmMajorClassChange
};
