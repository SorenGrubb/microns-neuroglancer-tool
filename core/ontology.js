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
const LEAF_NAMES={erythrocyte:"Erythrocyte",platelet:"Platelet",neutrophil:"Neutrophil",lymphocyte:"Lymphocyte",monocyte:"Monocyte",endothelial_cell:"Endothelial cell",pericyte:"Pericyte",smooth_muscle_cell:"Smooth muscle cell",venular_smooth_muscle_pericyte:"Venular smooth muscle cell",/* The three w2p pericyte subtypes had NO entry here, which broke them in four places at once:
        core/tree.js renders each option as label + "<b>("+LEAF_NAMES[slug]+")</b>" and was printing
        "(undefined)"; searchLeaves() filters on LEAF_NAMES[slug].toLowerCase() and could never find
        them; core/panel.js shows LEAF_NAMES[slug] as the recorded identity; and core/report.js
        submits canonSubmitName(LEAF_NAMES[slug]), so picking a subtype posted an empty identity.
        Wording follows w2p's own question text. Deliberately NOT folded into "Pericyte" via
        LEAF_SUBMIT_CANON -- somebody who answered three questions to reach "thin-strand" has said
        more than "pericyte", and the subtypes are separable in volume EM (Abdelazim et al. 2022,
        Front. Physiol., the source w2p's own criteria are drawn from). */
   pericyte_ensheathing:"Ensheathing pericyte",pericyte_mesh:"Mesh pericyte",pericyte_thin_strand:"Thin-strand pericyte",perivascular_macrophage:"Perivascular macrophage",perivascular_fibroblast:"Perivascular fibroblast",dendritic_cell:"Dendritic cell",excitatory_neuron:"Excitatory neuron",inhibitory_neuron:"Inhibitory neuron",exc_l23_it:"L2/3 pyramidal neuron (23P)",exc_l4:"Layer 4 pyramidal / spiny-stellate neuron (4P)",exc_l5_it:"Layer 5 IT pyramidal neuron (5P-IT)",exc_l5_et:"Layer 5 ET thick-tufted pyramidal neuron (5P-ET)",exc_l5_np:"Layer 5 near-projecting neuron (5P-NP)",exc_l6_it:"Layer 6 IT pyramidal neuron (6P-IT)",exc_l6_ct:"Layer 6 CT pyramidal neuron (6P-CT)",inh_basket:"Basket cell — PV / perisomatic-targeting (BC)",inh_martinotti:"Martinotti cell — SST / distal-targeting (MC)",inh_bipolar:"Bipolar cell — VIP / inhibitory-targeting (BPC)",inh_neurogliaform:"Neurogliaform cell — sparsely-targeting (NGC)",astrocyte:"Astrocyte",microglia:"Microglia",oligodendrocyte:"Oligodendrocyte",opc:"OPC",pia_mater_fibroblast:"Pia mater fibroblast",pial_sheath_fibroblast:"Pial sheath fibroblast",arachnoid_barrier_cell:"Arachnoid barrier cell",fibroblast_reticular_cell:"Fibroblast reticular cell",inner_arachnoid_fibroblast:"Inner arachnoid fibroblast",dural_border_cell:"Dural border cell"};
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


/* ==== organelle/structure ontology (moved here from core/panel.js, 2026-08-20) ====
   Moved so hJump -- which loads this file but deliberately NOT core/panel.js (see
   hjump-architecture-correction-2026-08-19) -- gets ORGANELLE_GROUPS etc. for free, instead of
   hand-duplicating a 61-kind list that would drift from µJump's/bJump's. core/panel.js still
   defines every FUNCTION that consumes this data (organelleFlagHtml, organelleFormHtml,
   wireOrganelleForm, organelleStructRowsHtml, organelleCountParts) -- only the pure data (plus
   organReportPointLabels/ORGANELLE_KIND_OPTIONS_HTML, which are one-liners derived from it)
   moved. See the pointer comment left in core/panel.js at the old location. ==== */
/* ==== organelle/structure ontology + read-back renderers  (was ujump.html lines 4688-4919) ==== */
/* ---------- Organelle/structure kinds (2026-08-02, expanded 2026-08-06) ----------
   Søren, 2026-08-02: "Instead of report centriole/cilium, it should be report an organelle...
   there should also be options for lysosomes, peroxisomes, golgi apparatus, endoplasmic
   reticulum, mitochondria, multivesicular bodies, lipid droplet, phagosome, glycogen, adherens
   junction, gap junction, tight junction, GFAP, synapse. All these should be a single
   annotation. I still want centrioles to be the default one and primary cilia to be the default
   if adding another one."
   Søren, 2026-08-06, on top of that original 16: "we need to have 'Nucleoplasmic reticulum (type
   I)' and 'Nucleoplasmic reticulum (type II)'. We could also have 'Nuclear pore' and the
   endoplasmic reticulum could be divided into 'Rough endoplasmic reticulum' and 'Smooth
   endoplasmic reticulum'. We also need [33 more, see the full list below] ... I guess it should
   be called 'Organelles and Extracellular Structures' and the list should be organized into
   topics." The single flat "er" kind was retired in favour of er_rough/er_smooth (an existing
   historical report with kind:"er" still displays fine -- see the "unrecognized kind" fallback
   below -- it just won't be double-counted into the new split kinds).
   Søren, same day, immediate follow-up: "Also add peg-and-socket junction, myoendothelial
   junction, tripartite junction, Astrocyte endfoot, Microglia plug, Swelling, Synaptic vesicle,
   Extracellular vesicle and Perivascular debris." The first 6 vascular/perivascular-contact terms
   got their own new "Vascular & perivascular contacts" group (distinct from the generic
   adherens/gap/tight "Cell junctions" group -- these are all specific neurovascular-unit contact
   types, matching Søren's own research focus); Synaptic/Extracellular vesicle joined "Vesicles &
   trafficking"; Swelling joined "Pathology".
   Søren, same day, one more addition: "I want to add a 'What the... is this?' for some organelle
   or extracellular structure that the user wants an expert opinion on." A dedicated "Not sure
   what this is?" group, ONE kind (ask_expert), placed FIRST in ORGANELLE_GROUPS so it's the most
   discoverable option in both dropdowns and the Filter-and-show checkbox list -- deliberately
   just another ORGANELLE_KINDS entry rather than a bespoke new reporting flow, so it inherits
   every existing mechanism for free: the report form's whole-submission "Comments (optional)"
   field already lets a reporter describe what's puzzling them, and checking its Filter-and-show
   box is how Søren (playing "the expert") finds and reviews every flagged point across the whole
   dataset. Given its own bespoke colour (matches --warn, #e3b341) instead of an auto-generated
   one, for the same "make this one stand out" reason centriole/cilium keep their own colours.
   Søren, same day, one more refinement pass: "Centrioles should still be the default for
   reporting an organelle. GFAP should be part of the cytoskeleton. We can add dendritic spine and
   axonal bouton to the category with synapse and rename that category. Tunelling nanotube should
   be in the cell junctions category." GFAP moved Markers & contacts -> Cytoskeleton (it's an
   intermediate-filament protein, so this is a straightforward reclassification, not a new kind).
   Tunneling nanotube moved Pathology -> Cell junctions. "Markers & contacts" (which would have
   been left with only "Synapse" after GFAP moved out) was renamed "Synaptic structures" and gained
   two new kinds, dendritic_spine and axonal_bouton. Separately: the two organelle-report forms'
   addRow() functions used to rely on "centriole" simply being the first <option> in the dropdown
   for their first-row default -- true before "ask_expert" was inserted at the very front of
   ORGANELLE_GROUPS earlier the same day, silently NOT true after. Both now set
   `kindEl.value="centriole"` explicitly for the first row (see the two addRow() comments below),
   so this default no longer depends on list ordering at all, no matter what's added or reordered
   in ORGANELLE_GROUPS in the future.

   ORGANELLE_GROUPS is the source of truth: an ordered list of {label, kinds:[...]} topic groups,
   each kind the same {value,label,short,vector} shape as before. ORGANELLE_KINDS (flat,
   derived below) is kept for every consumer that doesn't care about grouping -- this ONE
   structure drives every "what is this?" dropdown (the main organelle-report form's
   .organ-row-kind AND the merged-nucleus mini-widget's .mrOrganKind, now rendered as <optgroup>
   sections so a 49-item list stays navigable), every read-back display
   (organelleStructRowsHtml/organelleCountParts below), AND (new) the Filter-and-show "Organelles
   and extracellular structures" checkbox list (built from window.ORGANELLE_GROUPS -- exposed on
   window for that LATER <script> tag's UI).
   VERIFIED 2026-08-16: top-level `const`/`let` in one classic <script> tag ARE visible to
   every later <script> tag on the page -- they share one global lexical environment. Proof in
   this very file: `const N` (main block) is used bare at lines ~9951/10661/10733/10795 in four
   later blocks, and the vessel filters that depend on it work in production. What is NOT true:
   they are not properties of `window` (so `window.X` and `typeof window.X` fail), and a second
   `const X` anywhere on the page throws SyntaxError that silently kills that whole block.
   So the `window.` exposure here is belt-and-braces rather than required; harmless, left alone. `vector:true` is still what distinguishes cilium (the one kind needing
   base+tip, i.e. two points) from every other kind, which is "a single annotation" (one x/y/z
   point) -- adding a 50th kind later only means appending one entry to the right group here,
   never touching any function that loops over ORGANELLE_KINDS/ORGANELLE_GROUPS generically.
   `short` is the compact name used in count summaries ("2× centriole, 1× Golgi apparatus"),
   separate from the fuller dropdown `label`. kind VALUES are stored verbatim in the "Organelle
   locations" sheet's free-text `kind` column (see doPost's organelle_location branch in
   Code.gs.txt) -- no backend schema change was needed for any of these additions, since that
   column was never an enum server-side. */
const ORGANELLE_GROUPS=[
  {label:"Not sure what this is?",kinds:[
    {value:"ask_expert",label:"What the… is this? (ask an expert)",short:"flagged: ask expert",vector:false}
  ]},
  {label:"Nucleus",kinds:[
    {value:"nucleolus",label:"Nucleolus",short:"nucleolus",vector:false},
    {value:"chromatin",label:"Chromatin",short:"chromatin",vector:false},
    {value:"nuclear_pore",label:"Nuclear pore",short:"nuclear pore",vector:false},
    {value:"nucleoplasmic_reticulum_1",label:"Nucleoplasmic reticulum (type I)",short:"NR type I",vector:false},
    /* vector:true added 2026-08-07 (Søren: "we also need to update the nr type 2 reporting so that
       is 2 coordinte inputs") -- unlike type I, type II is the channel/hole-like form that runs
       through a stretch of tissue (matches his own "All own data.xlsx" hole-measurement columns,
       which record a start and end coordinate per hole), so it needs the same base+tip shape as
       cilium rather than a single point. This is the exact scenario the ORGANELLE_GROUPS design
       comment above anticipated ("a future vector kind... would automatically get the two-point
       fields too, with zero changes needed here") -- confirmed true: no changes needed to the
       report forms, storage, or point-viewer, all of which already key off .vector generically
       rather than a hardcoded ==="cilium" check. Only addition beyond the flag itself: pointLabels
       so the two coordinate fields read "Coordinate 1"/"Coordinate 2" instead of the cilium-specific
       "Base"/"Tip" wording (a reticulum channel doesn't have a biological "base" or "tip") -- see
       organReportPointLabels() below, used by every render/form site that used to hardcode
       "Base"/"Tip". */
    {value:"nucleoplasmic_reticulum_2",label:"Nucleoplasmic reticulum (type II)",short:"NR type II",vector:true,pointLabels:["Coordinate 1","Coordinate 2"]}
  ]},
  {label:"Centriole & cilium",kinds:[
    {value:"centriole",label:"Centriole / centrosome",short:"centriole",vector:false},
    {value:"cilium",label:"Primary cilium (base + tip)",short:"cilium",vector:true,pointLabels:["Base","Tip"]}
  ]},
  {label:"Endomembrane system",kinds:[
    {value:"er_rough",label:"Rough endoplasmic reticulum",short:"rough ER",vector:false},
    {value:"er_smooth",label:"Smooth endoplasmic reticulum",short:"smooth ER",vector:false},
    {value:"golgi",label:"Golgi apparatus",short:"Golgi apparatus",vector:false},
    {value:"lysosome",label:"Lysosome",short:"lysosome",vector:false},
    {value:"peroxisome",label:"Peroxisome",short:"peroxisome",vector:false},
    {value:"mitochondria",label:"Mitochondria",short:"mitochondrion",vector:false},
    {value:"mvb",label:"Multivesicular body",short:"MVB",vector:false},
    {value:"endosome",label:"Endosome",short:"endosome",vector:false}
  ]},
  {label:"Vesicles & trafficking",kinds:[
    {value:"pinocytic_vesicle",label:"Pinocytic vesicle",short:"pinocytic vesicle",vector:false},
    {value:"caveolae",label:"Caveolae",short:"caveolae",vector:false},
    {value:"secretory_vesicle",label:"Secretory vesicle",short:"secretory vesicle",vector:false},
    {value:"transport_vesicle",label:"Transport vesicle",short:"transport vesicle",vector:false},
    {value:"autophagosome",label:"Autophagosome",short:"autophagosome",vector:false},
    {value:"phagosome",label:"Phagosome",short:"phagosome",vector:false},
    {value:"weibel_palade_body",label:"Weibel-Palade body",short:"Weibel-Palade body",vector:false},
    {value:"synaptic_vesicle",label:"Synaptic vesicle",short:"synaptic vesicle",vector:false},
    {value:"extracellular_vesicle",label:"Extracellular vesicle",short:"extracellular vesicle",vector:false}
  ]},
  {label:"Cytoskeleton",kinds:[
    {value:"microtubules",label:"Microtubules",short:"microtubules",vector:false},
    {value:"microfilaments",label:"Microfilaments",short:"microfilaments",vector:false},
    {value:"intermediate_filaments",label:"Intermediate filaments",short:"intermediate filaments",vector:false},
    {value:"contractile_elements",label:"Contractile elements",short:"contractile elements",vector:false},
    {value:"gfap",label:"GFAP",short:"GFAP",vector:false}
  ]},
  {label:"Cell junctions",kinds:[
    {value:"adherens_junction",label:"Adherens junction",short:"adherens junction",vector:false},
    {value:"gap_junction",label:"Gap junction",short:"gap junction",vector:false},
    {value:"tight_junction",label:"Tight junction",short:"tight junction",vector:false},
    {value:"tunneling_nanotube",label:"Tunneling nanotube",short:"tunneling nanotube",vector:false}
  ]},
  {label:"Vascular & perivascular contacts",kinds:[
    {value:"peg_and_socket_junction",label:"Peg-and-socket junction",short:"peg-and-socket junction",vector:false},
    {value:"myoendothelial_junction",label:"Myoendothelial junction",short:"myoendothelial junction",vector:false},
    {value:"tripartite_junction",label:"Tripartite junction",short:"tripartite junction",vector:false},
    {value:"astrocyte_endfoot",label:"Astrocyte endfoot",short:"astrocyte endfoot",vector:false},
    {value:"microglia_plug",label:"Microglia plug",short:"microglia plug",vector:false},
    {value:"perivascular_debris",label:"Perivascular debris",short:"perivascular debris",vector:false}
  ]},
  {label:"Cytoplasmic inclusions",kinds:[
    {value:"lipid_droplet",label:"Lipid droplet",short:"lipid droplet",vector:false},
    {value:"glycogen",label:"Glycogen",short:"glycogen",vector:false},
    {value:"ribosome",label:"Ribosome",short:"ribosome",vector:false},
    {value:"lipofuscin_granule",label:"Lipofuscin granule",short:"lipofuscin granule",vector:false},
    {value:"corpora_amylacea",label:"Corpora amylacea",short:"corpora amylacea",vector:false}
  ]},
  {label:"Surface & membrane specializations",kinds:[
    {value:"microvillus",label:"Microvillus",short:"microvillus",vector:false},
    {value:"glycocalyx",label:"Glycocalyx",short:"glycocalyx",vector:false},
    {value:"myelin_sheath",label:"Myelin sheath",short:"myelin sheath",vector:false}
  ]},
  {label:"Synaptic structures",kinds:[
    {value:"synapse",label:"Synapse",short:"synapse",vector:false},
    {value:"dendritic_spine",label:"Dendritic spine",short:"dendritic spine",vector:false},
    {value:"axonal_bouton",label:"Axonal bouton",short:"axonal bouton",vector:false}
  ]},
  {label:"Extracellular matrix & structures",kinds:[
    {value:"elastin",label:"Elastin",short:"elastin",vector:false},
    {value:"fibrin",label:"Fibrin",short:"fibrin",vector:false},
    {value:"collagen",label:"Collagen",short:"collagen",vector:false},
    {value:"extracellular_space",label:"Extracellular space",short:"extracellular space",vector:false},
    {value:"glia_limitans",label:"Glia limitans",short:"glia limitans",vector:false},
    {value:"basement_membrane",label:"Basement membrane",short:"basement membrane",vector:false}
  ]},
  {label:"Pathology",kinds:[
    {value:"amyloid_beta_plaque",label:"Amyloid beta plaque",short:"amyloid-β plaque",vector:false},
    {value:"tau_tangle",label:"Tau tangle",short:"tau tangle",vector:false},
    {value:"dystrophic_neurite",label:"Dystrophic neurite",short:"dystrophic neurite",vector:false},
    {value:"swelling",label:"Swelling",short:"swelling",vector:false}
  ]}
];
window.ORGANELLE_GROUPS=ORGANELLE_GROUPS;
const ORGANELLE_KINDS=ORGANELLE_GROUPS.reduce((a,g)=>a.concat(g.kinds),[]);
const ORGANELLE_KIND_BY_VALUE={};ORGANELLE_KINDS.forEach(k=>ORGANELLE_KIND_BY_VALUE[k.value]=k);
/* Shared label lookup for the two coordinate fields of any vector (2-point) kind -- added
   2026-08-07 alongside nucleoplasmic_reticulum_2 becoming the 2nd vector kind (cilium was the
   only one before). Every render/form site that used to hardcode "Base"/"Tip" now calls this
   instead, so a kind's own pointLabels (falling back to a generic "Point 1"/"Point 2" if a
   future vector kind is added without specifying any) drives the wording everywhere at once. */
function organReportPointLabels(kindValue){
  const info=ORGANELLE_KIND_BY_VALUE[kindValue];
  return (info&&info.pointLabels)||["Point 1","Point 2"];
}
/* <optgroup>-sectioned <option> list shared verbatim by both organelle-reporting forms (see the
   big comment above) -- topic-organized per Søren's "the list should be organized into topics"
   now that it has grown to 49 entries. */
const ORGANELLE_KIND_OPTIONS_HTML=ORGANELLE_GROUPS.map(g=>'<optgroup label="'+g.label+'">'+g.kinds.map(k=>'<option value="'+k.value+'">'+k.label+'</option>').join("")+'</optgroup>').join("");

UJ.ontology = {
  TREE: TREE, LEAF_NAMES: LEAF_NAMES, CONFUSED_WITH: CONFUSED_WITH,
  IMAGE_LIBRARY: IMAGE_LIBRARY, canonSubmitName: canonSubmitName,
  familyOf: familyOf, confirmMajorClassChange: confirmMajorClassChange,
  ORGANELLE_GROUPS: ORGANELLE_GROUPS, ORGANELLE_KINDS: ORGANELLE_KINDS,
  ORGANELLE_KIND_BY_VALUE: ORGANELLE_KIND_BY_VALUE, organReportPointLabels: organReportPointLabels
};
