// Description: Configures MLComponent and decodes output

// Public api:
//
// add onDetectionsUpdated event callback
// script.onDetectionsUpdated.add(callback);

// get total class count
// script.getClassCount()

// get class name by index
// script.getClassLabel(index)

//inputs
//@input Asset.MLAsset model {"label": "ML Model", "hint": "Object Detection ML Model"}
/** @type {MLAsset} */
var model = script.model;

//@ui {"widget" : "separator"}
//@input float scoreThreshold = 0.4 {"widget" : "slider", "min" : 0, "max" : 1, "step" : 0.05}
/** @type {number} */
var scoreThreshold = script.scoreThreshold;

//@input float iouThreshold = 0.65 {"widget" : "slider", "min" : 0, "max" : 1, "step" : 0.05}
/** @type {number} */
var iouThreshold = script.iouThreshold;

/*
@typedef ClassSettings
@property {string} label
@property {int} nutriScore {"widget":"combobox", "values":[{"label":"A", "value":5}, {"label":"B", "value":4}, {"label":"C", "value":3}, {"label":"D", "value":2}, {"label":"E", "value":1}]}
*/
//@ui {"widget" : "separator"}
// @input ClassSettings[] classSettings
/** @type {[string, int]} */
var classSettings = script.classSettings;

var DetectionHelpers = require("Modules/DetectionHelpersModule");
var Events = require("Modules/EventModule");

const EventWrapper = Events.EventWrapper;

const anchors = [
    [
        [144, 300],
        [304, 220],
        [288, 584],
    ],
    [
        [568, 440],
        [768, 972],
        [1836, 1604],
    ],
    [
        [48, 64],
        [76, 144],
        [160, 112],
    ],
];

const strides = [16, 32, 8];

/**
 * @typedef {[number, number]} GridEntry
 */
/** @type {GridEntry[][][]}*/
var grids = [];
/** @type {[number, number, number, number]}*/
var boxes = [];
/** @type {number[]}*/
var scores = [];
/** @type {vec3} */
var inputShape;
/** @type {MLComponent} */
var mlComponent;
/** @type {MLComponent} */
var mlComponent2;
/** @type {OutputPlaceholder[]} */
var outputs;
/** @type {InputPlaceholder[]} */
var inputs;
/** @type {OutputPlaceholder[]} */
var outputs2;
/** @type {InputPlaceholder[]} */
var inputs2;
/** @type {number} */
var classCount = classSettings.length;

/** @type {EventWrapper} List of callbacks to call once detections were processed */
var onDetectionsUpdated = new EventWrapper();

// cam
let cameraModule = require("LensStudio:CameraModule");

/**
 * create ml component
 */
function onAwake() {
    if (!script.model) {
        print("Error, please set ML Model asset input");
        return;
    }

    // 1
    mlComponent = script.getSceneObject().createComponent("MLComponent");
    mlComponent.model = model;
    mlComponent.onLoadingFinished = onLoadingFinished;
    mlComponent.onRunningFinished = onRunningFinished;
    mlComponent.inferenceMode = MachineLearning.InferenceMode.Accelerator;
    mlComponent.build([]);

    // 2
    mlComponent2 = script.getSceneObject().createComponent("MLComponent");
    mlComponent2.model = model;
    mlComponent2.onLoadingFinished = onLoadingFinished2;
    mlComponent2.onRunningFinished = onRunningFinished2;
    mlComponent2.inferenceMode = MachineLearning.InferenceMode.Accelerator;
    mlComponent2.build([]);
}

/**
 * configures inputs and outputs, starts running ml component
 */
function onLoadingFinished() {
    outputs = mlComponent.getOutputs();
    inputs = mlComponent.getInputs();

    // build grids
    for (var i = 0; i < outputs.length; i++) {
        var shape = outputs[i].shape;
        grids.push(makeGrid(shape.x, shape.y));
    }
    inputShape = inputs[0].shape;

    // set camera texture
    let cameraRequestLeft = CameraModule.createCameraRequest();
    cameraRequestLeft.cameraId = CameraModule.CameraId.Left_Color;
    let cameraTexLeft = cameraModule.requestCamera(cameraRequestLeft);

    inputs[0].texture = cameraTexLeft;
}

function onLoadingFinished2() {
    outputs2 = mlComponent2.getOutputs();
    inputs2 = mlComponent2.getInputs();

    // set camera texture
    let cameraRequestRight = CameraModule.createCameraRequest();
    cameraRequestRight.cameraId = CameraModule.CameraId.Right_Color;
    let cameraTexRight = cameraModule.requestCamera(cameraRequestRight);

    inputs2[0].texture = cameraTexRight;
}

function onRunningFinished() {
    parseResults(outputs);
}

function onRunningFinished2() {
    parseResults(outputs2);
}

/* Averages two bounding boxes and returns the result */
function mergeBboxes(bbox1, bbox2) {
    const mergedBbox = [];

    for (let i = 0; i < bbox1.length; i++) {
        mergedBbox.push((bbox1[i] + bbox2[i]) / 2);
    }

    return mergedBbox;
}

/* Merge two detection results into one better result */
function mergeDetections(detections1, detections2) {
    const mergedDetections = {};

    // Create a set of all labels without duplicates
    const labels1 = Object.keys(detections1);
    const labels2 = Object.keys(detections2);
    const allLabels = new Set([...labels1, ...labels2]);

    for (const label of allLabels) {
        // Average the bboxes if both labels exist
        if (detections1[label] && detections2[label]) {
            const bbox1 = detections1[label].bbox;
            const bbox2 = detections2[label].bbox;

            detections1[label].bbox = mergeBboxes(bbox1, bbox2); // reuse detections1
            mergedDetections[label] = detections1[label];
        }
        // If only one label detected
        else if (!script.consensusRequired) {
            const data = detections1[label] || detections2[label];
            mergedDetections[label] = data;
        }
    }

    return mergedDetections;
}

let detectionsBuffer;

function parseResults(outputs) {
    [boxes, scores] = parseYolo7Outputs(outputs);

    // Get results
    const results = DetectionHelpers.nms(boxes, scores, scoreThreshold, iouThreshold).sort(
        DetectionHelpers.compareByScoreReversed
    );

    // Convert all results to a detection in the format {label: {...data}}
    // This is used to reqeust the label data more efficiently
    const detections = {};

    for (var i = 0; i < results.length; i++) {
        const result = results[i]; // model output
        const classSetting = classSettings[result.index]; // user defined data

        detections[classSetting.label] = {
            confidence: result.score,
            bbox: result.bbox,
            nutriScore: classSetting.nutriScore,
        };
    }

    // Only trigger when both camera frames are processed
    if (detectionsBuffer) {
        const mergedDetections = mergeDetections(detections, detectionsBuffer);
        onDetectionsUpdated.trigger(mergedDetections);
        detectionsBuffer = null; // Reset buffer
    } else {
        detectionsBuffer = detections;
    }
}

// The following code is based on:
// https://github.com/WongKinYiu/yolov7/blob/44d8ab41780e24eba563b6794371f29db0902271/models/yolo.py#L416
/**
 *
 * @param {number} nx
 * @param {number} ny
 * @returns {GridEntry[][]}
 */
function makeGrid(nx, ny) {
    var grids = [];
    for (var dy = 0; dy < ny; dy++) {
        var grid = [];
        for (var dx = 0; dx < nx; dx++) {
            grid.push([dx, dy]);
        }
        grids.push(grid);
    }
    return grids;
}

/**
 *
 * @param {OutputPlaceholder[]} outputs
 * @returns
 */
function parseYolo7Outputs(outputs) {
    const boxes = [];
    const scores = [];
    var num_heads = outputs.length;
    for (var i = 0; i < num_heads; i++) {
        var output = outputs[i];
        var data = output.data;
        var shape = output.shape;
        var nx = shape.x;
        var ny = shape.y;
        var step = classCount + 4 + 1;

        // [nx, ny, 255] -> [nx, ny, n_anchors(3), n_outputs(classCount + 4 + 1)]
        for (var dy = 0; dy < ny; dy++) {
            for (var dx = 0; dx < nx; dx++) {
                for (var da = 0; da < anchors.length; da++) {
                    var idx =
                        dy * nx * anchors.length * step + dx * anchors.length * step + da * step;
                    // 0-1: xy, 2-3: wh, 4: conf, 5-5+classCount: scores
                    var x = data[idx];
                    var y = data[idx + 1];
                    var w = data[idx + 2];
                    var h = data[idx + 3];
                    var conf = data[idx + 4];

                    if (conf > scoreThreshold) {
                        // This code is simplified from:
                        // https://github.com/WongKinYiu/yolov7/blob/44d8ab41780e24eba563b6794371f29db0902271/models/yolo.py#L59-L61
                        x = (x * 2 - 0.5 + grids[i][dy][dx][0]) * strides[i];
                        y = (y * 2 - 0.5 + grids[i][dy][dx][1]) * strides[i];
                        w = w * w * anchors[i][da][0];
                        h = h * h * anchors[i][da][1];

                        var res = { cls: 0, score: 0 };
                        var box = [
                            x / inputShape.x,
                            y / inputShape.y,
                            w / inputShape.y,
                            h / inputShape.y,
                        ];
                        for (var nc = 0; nc < classCount; nc++) {
                            var class_score = data[idx + 5 + nc] * conf;
                            if (class_score > scoreThreshold && class_score > res.score) {
                                res.cls = nc;
                                res.score = class_score;
                            }
                        }
                        if (res.score > 0) {
                            boxes.push(box);
                            scores.push(res);
                        }
                    }
                }
            }
        }
    }
    return [boxes, scores];
}

/* Run both detections asynchronously */
function runOnce() {
    mlComponent.runImmediate(false);
    mlComponent2.runImmediate(false);
}

/**
 * returns a number of classes that model detects
 * @returns {number}
 */
function getClassCount() {
    return classCount;
}

function getClassLabel(index) {
    return classSettings[index].label ? classSettings[index].label : "class_" + index;
}

// Initialize
onAwake();

//public api functions
script.onDetectionsUpdated = onDetectionsUpdated;
script.getClassCount = getClassCount;
script.getClassLabel = getClassLabel;
script.runOnce = runOnce;
