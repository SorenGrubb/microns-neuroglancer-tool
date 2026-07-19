
# MICrONS → Neuroglancer Cell Identification Tool

A self-contained HTML tool for exploring the [MICrONS](https://www.microns-explorer.org/) minnie65 mouse visual cortex dataset: jump to any coordinate, see the nearest cell and its predicted type, and open the location directly in Neuroglancer with the right segmentation and nucleus pre-selected.

Built by **Søren Grubb** (Neuroscience Academy Denmark) to make identifying brain cortical cells in electron microscopy easier and more collaborative. Built with the assistance of Claude AI.

## What it does

- **Coordinate lookup** — paste a coordinate (voxels, nanometres, or micrometres) and jump straight to it; paste `x, y, z` into the first field and it splits automatically. The last 3 searched coordinates are kept as one-click history chips.
- **Nearest-cell identification** — finds the closest annotated nucleus and shows its MICrONS cell-type prediction (broad class + fine m-type, where available), estimated cortical layer, distance to the glia limitans, distance to the white matter border, nearest traced blood vessel (type + distance), and its three nearest neighbouring cells. Every coordinate and ID shown is click-to-copy.
- **One-click Neuroglancer links** — the identified cell's name is itself the Neuroglancer link; an inline arrow button next to the coordinate fields builds the link and starts identification. Falls back to the wider minnie35/Img35 imagery and segmentation for coordinates outside the minnie65-predicted volume. Every generated 3D view also draws the cortical layer boundaries, pia (glia limitans) surface and white-matter surface as labelled 3D line annotations, and automatically zooms out further for neurons than for smaller cell types, since a full dendritic/axonal reconstruction can span far more than a soma.
- **Combined location diagram** — a single diagram showing the typed coordinate's estimated cortical layer (depth-scaled to that location's own locally traced pia/white-matter thickness) alongside its position within the minnie65/minnie35 imaged-volume extents, in top and side view.
- **Verified identifications** — cross-references a hand-curated, expert-verified set of cell-type identifications (from Søren's own published and unpublished work — see [References](#references)), which take precedence over the automated MICrONS prediction where available.
- **Community identification & reporting** — lets users browse a random unclassified cell (or a random example of a given type) and identify it through the guided tree, with a 1–5 certainty rating and optional Google sign-in for attribution. Depending on the situation, users can: flag a disagreement with MICrONS' own prediction, confirm they independently agree with it (more agreement builds more confidence in a call), contribute a first identification for a cell MICrONS never predicted, log a brand-new cell MICrONS' detector missed entirely (with duplicate-report detection), flag a nucleus detection as a segmentation artefact, split a single detection that's actually two or more fused nuclei, or log centriole/primary-cilium coordinates on an already-identified cell. All of this is shared back with the MICrONS consortium and shown to other users browsing the same cell.
- **Guided decision-tree identification** — a step-by-step ultrastructural decision tree covering 16 broad cell-type categories (immune cells, vascular cells, neurons, glia, and leptomeningeal cell types), expanding to 34 total leaf-level identifications once neuron and leptomeningeal subtypes are included, each with sourced criteria and a reference-image gallery. A fast type-ahead search jumps straight to any leaf type from the main screen or mid-tree. Each result screen can also pull up a random verified or MICrONS-predicted example of that same cell type for comparison.
- **Filter & bulk export** — filter the whole dataset by cell type(s), vessel proximity (type + distance), glia-limitans distance, white-matter-border distance, cortical layer, Allen Institute V1-column membership, one or more coordinate bounding boxes (with a live top/side-view preview against the dataset extents), and/or "needs attention" tiers (unclassified, verified-but-unpredicted, community-reported, or totally untouched). Preview the match count, download every match as an Excel file (coordinates, root/nucleus IDs, m-type, vessel info, 3 nearest neighbours, community-report tally), or open every match at once in a single colour-coded 3D Neuroglancer view (optionally including the traced vasculature outline, raw EM imagery, and the V1-column wireframe).

## How to use it

1. Download **both** `microns_neuroglancer_jump.html` and `microns_images_data.js` and keep them in the same folder. The `.js` file holds the (compressed) reference-image gallery used by the guided-identification tool; without it the rest of the tool still works fully, just without those thumbnail images.
2. Open the HTML file in any modern browser (double-click, or drag it into a browser window) — no installation, server, or build step required.
3. Enter a coordinate (or click "Random unassigned cell" / "Random example"), then click the arrow button next to the coordinate fields.
4. Click the identified cell's name to open the 3D segmentation and EM imagery in Neuroglancer, or use the filter panel to browse/export many cells at once.

All the core data (nucleus positions, cell-type predictions, m-types, the verified-identification dataset, traced vessel outlines, and traced pia/white-matter surfaces) is packed directly into the HTML file as base64-encoded binary arrays, so it works fully offline except for the actual Neuroglancer viewer, Google sign-in, community reporting, and the reference-image thumbnails (loaded from the companion `.js` file).

## Data sources

- **MICrONS dataset** (minnie65 mouse visual cortex; CC-BY) — nucleus positions, cell segmentation, and cell-type predictions.
- **minnie35/Img35** — the wider raw EM imagery + segmentation volume that minnie65 sits within, used as a fallback outside the minnie65-predicted region.
- Søren's own hand-verified cell-type identifications (published and unpublished), used to override or flag MICrONS predictions where they diverge.
- Manually traced vessel outlines, used to compute each cell's nearest vessel type and distance.
- Manually traced pia (glia limitans) and white-matter surfaces, used to estimate cortical depth and layer. Layer boundaries are taken from Ledderose et al. (2023) and rescaled proportionally to each location's own locally traced cortical thickness, since both that source and MICrONS are chemically fixed tissue and fixation is known to shrink cortex — see [References](#references).

## References

- Grubb, "Ultrastructure of precapillary sphincters and the neurovascular unit," *Vascular Biology* 5, VB-23-0011 (2023). https://doi.org/10.1530/vb-23-0011
- Grubb, "Ultrastructure of the brain waste-clearance pathway," bioRxiv preprint (2023), not yet peer-reviewed. https://doi.org/10.1101/2023.04.14.536712
- Grubb, Chaddha, Lippincott-Schwartz, Ott & Mughal, "Pericyte and Endothelial Primary Cilia and Centrioles have Disparate Organization Across the Brain Microvasculature," bioRxiv preprint (2025), not yet peer-reviewed. https://doi.org/10.1101/2025.11.19.689283
- Morris, Foster, Sutherland & Grubb, "Microglia contact cerebral vasculature through gaps between astrocyte endfeet," *Journal of Cerebral Blood Flow & Metabolism* 44(12), 1472–1486 (2024). https://doi.org/10.1177/0271678X241280775
- The MICrONS Consortium, "Functional connectomics spanning multiple areas of mouse visual cortex," *Nature* 640, 435–447 (2025). https://doi.org/10.1038/s41586-025-08790-w
- Elabbady et al., "Perisomatic ultrastructure efficiently classifies cells in mouse cortex," *Nature* 640, 478–486 (2025). https://www.nature.com/articles/s41586-024-07765-7
- "Brain Ultrastructure: Putting the Pieces Together," PMC7930431. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7930431/
- "Public Volume Electron Microscopy Data: An Essential Resource to Study the Brain Microvasculature," *Frontiers in Cell and Developmental Biology* (2022). https://www.frontiersin.org/journals/cell-and-developmental-biology/articles/10.3389/fcell.2022.849469/full
- "Neurotransmitter classification from EM images at synaptic sites," *Cell* (2024). https://www.cell.com/cell/fulltext/S0092-8674(24)00307-6
- Gray, E.G., "Axo-somatic and axo-dendritic synapses of the cerebral cortex: an electron microscope study," *J. Anat.* 93:420–433 (1959) (foundational; no open-access link).
- Ledderose et al., "Layer 1 of somatosensory cortex: an important site for input to a tiny cortical compartment," *Cerebral Cortex* (2023). https://doi.org/10.1093/cercor/bhad371
- Korogod, Petersen & Knott, "Ultrastructural analysis of adult mouse neocortex comparing aldehyde perfusion with cryo fixation," *eLife* 4:e05793 (2015). https://doi.org/10.7554/eLife.05793
- Schneider-Mizell et al., "Inhibitory specificity from a connectomic census of mouse visual cortex," *Nature* 640, 448–458 (2025). https://doi.org/10.1038/s41586-024-07780-8
- Weis et al., "An unsupervised map of excitatory neuron dendritic morphology in the mouse visual cortex," *Nature Communications* 16, 3361 (2025). https://doi.org/10.1038/s41467-025-58763-w
- Bodor et al., "The synaptic architecture of layer 5 thick tufted excitatory neurons in the visual cortex of mice," *Nature Neuroscience* (2025). https://doi.org/10.1038/s41593-025-02004-2
- Gamlin et al., "Connectomics of predicted Sst transcriptomic types in mouse visual cortex," *Nature* 640, 497–505 (2025). https://doi.org/10.1038/s41586-025-08805-6
- Harris & Shepherd, "The neocortical circuit: themes and variations," *Nature Neuroscience* 18, 170–181 (2015). https://doi.org/10.1038/nn.3917
- Tremblay, Lee & Rudy, "GABAergic Interneurons in the Neocortex: From Cellular Properties to Circuits," *Neuron* 91, 260–292 (2016). https://doi.org/10.1016/j.neuron.2016.06.033
- Nimmerjahn, Kirchhoff & Helmchen, "Resting Microglial Cells Are Highly Dynamic Surveillants of Brain Parenchyma in Vivo," *Science* 308, 1314–1318 (2005). https://doi.org/10.1126/science.1110647
- Bergles & Richardson, "Oligodendrocyte Development and Plasticity," *Cold Spring Harbor Perspectives in Biology* 8, a020453 (2016). https://doi.org/10.1101/cshperspect.a020453
- Pfeiffer, "Reciprocal Interactions between Oligodendrocyte Precursor Cells and the Neurovascular Unit in Health and Disease," *Cells* 11, 1954 (2022). https://doi.org/10.3390/cells11121954
- Takahashi, "Metabolic Contribution and Cerebral Blood Flow Regulation by Astrocytes in the Neurovascular Unit," *Cells* 11, 813 (2022). https://doi.org/10.3390/cells11050813
- Girolamo et al., "Central Nervous System Pericytes Contribute to Health and Disease," *Cells* 11, 1707 (2022). https://doi.org/10.3390/cells11101707
- Zedde & Pascarella, "Leptomeninges: Anatomy, Mechanisms of Disease and Neuroimaging," *Neurology International* 17, 203 (2025). https://doi.org/10.3390/neurolint17120203
- Pietilä et al., "Molecular anatomy of adult mouse leptomeninges," *Neuron* 111, 3745–3764.e7 (2023). https://doi.org/10.1016/j.neuron.2023.09.002
- Fields, "White matter in learning, cognition and psychiatric disorders," *Trends in Neurosciences* 31, 361–370 (2008). https://doi.org/10.1016/j.tins.2008.04.001

## License

This project is licensed under [CC BY 4.0](LICENSE) — you're free to share and adapt it, with attribution.

## Author

Søren Grubb, Neuroscience Academy Denmark
