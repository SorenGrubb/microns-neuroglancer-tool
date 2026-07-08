
# MICrONS → Neuroglancer Cell Identification Tool

A self-contained, single-file HTML tool for exploring the [MICrONS](https://www.microns-explorer.org/) minnie65 mouse visual cortex dataset: jump to any coordinate, see the nearest cell and its predicted type, and open the location directly in Neuroglancer with the right segmentation and nucleus pre-selected.

Built by **Søren Grubb** (Neuroscience Academy Denmark) to make identifying brain cortical cells in electron microscopy easier and more collaborative. Built with the assistance of Claude AI.

## What it does

- **Coordinate lookup** — paste a coordinate (voxels, nanometres, or micrometres) and jump straight to it.
- **Nearest-cell identification** — finds the closest annotated nucleus and shows its MICrONS cell-type prediction (broad class + fine m-type, where available), cortical layer, and three nearest neighbours.
- **One-click Neuroglancer links** — generates a ready-to-open Neuroglancer state with the EM imagery, segmentation, and nucleus layer already configured and the relevant IDs selected. Falls back to the wider minnie35/Img35 imagery and segmentation for coordinates outside the minnie65-predicted volume.
- **Verified identifications** — cross-references a hand-curated, expert-verified set of cell-type identifications (from Søren and co-authors' own published and unpublished work), which take precedence over the automated MICrONS prediction where available.
- **Community identification game** — lets users browse a random unclassified cell (or a random example of a given type) to help build out identifications that are shared back with the MICrONS consortium, with Google sign-in for attribution and a lightweight scoring/report mechanism.
- **Guided decision-tree identification** — a step-by-step ultrastructural decision tree covering 20 leaf cell types (immune cells, vascular cells, neurons, glia, and leptomeningeal cell types), each with sourced criteria.

## How to use it

This is a single HTML file — no installation, server, or build step required.

1. Download `microns_neuroglancer_jump.html`.
2. Open it in any modern browser (double-click, or drag it into a browser window).
3. Enter a coordinate (or click "Random example"/"Random unassigned cell"), then click **Build link + identify cell**.
4. Click **Open in Neuroglancer** to view the 3D segmentation and EM imagery.

All data (nucleus positions, cell-type predictions, m-types, and the verified-identification dataset) is packed directly into the HTML file as base64-encoded binary arrays, so it works fully offline except for the actual Neuroglancer viewer and Google sign-in.

## Data sources

- **MICrONS dataset** (minnie65 mouse visual cortex; CC-BY) — nucleus positions, cell segmentation, and cell-type predictions.
- **minnie35/Img35** — the wider raw EM imagery + segmentation volume that minnie65 sits within, used as a fallback outside the minnie65-predicted region.
- Søren's own hand-verified cell-type identifications (published and unpublished), used to override or flag MICrONS predictions where they diverge.

## References

- The MICrONS Consortium, "Functional connectomics spanning multiple areas of mouse visual cortex," *Nature* 640, 435–447 (2025). https://doi.org/10.1038/s41586-025-08790-w
- Elabbady et al., "Perisomatic ultrastructure efficiently classifies cells in mouse cortex," *Nature* 640, 478–486 (2025). https://www.nature.com/articles/s41586-024-07765-7
- Schneider-Mizell et al., "Inhibitory specificity from a connectomic census of mouse visual cortex," *Nature* 640, 448–458 (2025). https://doi.org/10.1038/s41586-024-07780-8
- Harris & Shepherd, "The neocortical circuit: themes and variations," *Nature Neuroscience* 18, 170–181 (2015). https://doi.org/10.1038/nn.3917
- Tremblay, Lee & Rudy, "GABAergic Interneurons in the Neocortex: From Cellular Properties to Circuits," *Neuron* 91, 260–292 (2016). https://doi.org/10.1016/j.neuron.2016.06.033
- Nimmerjahn, Kirchhoff & Helmchen, "Resting Microglial Cells Are Highly Dynamic Surveillants of Brain Parenchyma in Vivo," *Science* 308, 1314–1318 (2005). https://doi.org/10.1126/science.1110647
- Bergles & Richardson, "Oligodendrocyte Development and Plasticity," *Cold Spring Harbor Perspectives in Biology* 8, a020453 (2016). https://doi.org/10.1101/cshperspect.a020453
- Pfeiffer, "Reciprocal Interactions between Oligodendrocyte Precursor Cells and the Neurovascular Unit in Health and Disease," *Cells* 11, 1954 (2022). https://doi.org/10.3390/cells11121954
- Takahashi, "Metabolic Contribution and Cerebral Blood Flow Regulation by Astrocytes in the Neurovascular Unit," *Cells* 11, 813 (2022). https://doi.org/10.3390/cells11050813
- Girolamo et al., "Central Nervous System Pericytes Contribute to Health and Disease," *Cells* 11, 1707 (2022). https://doi.org/10.3390/cells11101707
- Zedde & Pascarella, "Leptomeninges: Anatomy, Mechanisms of Disease and Neuroimaging," *Neurology International* 17, 203 (2025). https://doi.org/10.3390/neurolint17120203
- Fields, "White matter in learning, cognition and psychiatric disorders," *Trends in Neurosciences* 31, 361–370 (2008). https://doi.org/10.1016/j.tins.2008.04.001
- Ledderose et al., "Layer 1 of somatosensory cortex: an important site for input to a tiny cortical compartment," *Cerebral Cortex* (2023). https://doi.org/10.1093/cercor/bhad371

## License

This project is licensed under [CC BY 4.0](LICENSE) — you're free to share and adapt it, with attribution.

## Author

Søren Grubb, Neuroscience Academy Denmark
