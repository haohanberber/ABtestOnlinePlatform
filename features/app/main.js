import { initDatasetPreviewOverlay } from "../common/preview.js";
import { initExperimentDesign } from "../experiment-design/index.js";
import { initSignificanceTest } from "../significance-test/index.js";
import { initResultDatasetUpload } from "../result-dataset-upload/index.js";
import { initHashBucketing } from "../hash-bucketing/index.js";
import { initOnlineExperimentPage } from "../online-experiment/index.js";

const previewOverlay = initDatasetPreviewOverlay();

initExperimentDesign();
initSignificanceTest();
initResultDatasetUpload(previewOverlay);
initHashBucketing(previewOverlay);
initOnlineExperimentPage();
