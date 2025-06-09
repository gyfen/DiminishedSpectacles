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
//@ui {"widget":"group_start", "label":"NMS"}
//@input float scoreThreshold = 0.4 {"widget" : "slider", "min" : 0, "max" : 1, "step" : 0.05}
/** @type {number} */
var scoreThreshold = script.scoreThreshold;

//@input float iouThreshold = 0.65 {"widget" : "slider", "min" : 0, "max" : 1, "step" : 0.05}
/** @type {number} */
var iouThreshold = script.iouThreshold;
//@ui {"widget":"group_end"}

/*
@typedef ClassSettings
@property {string} label
@property {int} nutriScore {"widget":"combobox", "values":[{"label":"A", "value":0}, {"label":"B", "value":1}, {"label":"C", "value":2}, {"label":"D", "value":3}, {"label":"E", "value":4}]}
*/
//@ui {"widget" : "separator"}
//@ui {"widget":"group_start", "label":"Labels and values"}
// @input ClassSettings[] classSettings
/** @type {[string, int]} */
var classSettings = script.classSettings;
//@ui {"widget":"group_end"}

//@ui {"widget" : "separator"}
// @input bool debugTextureOverride = false
const debugTextureOverride = script.debugTextureOverride;
// @input Asset.Texture overrideTexture {"showIf": "debugTextureOverride"}
const overrideTexture = script.overrideTexture;

var DetectionHelpers = require("Modules/DetectionHelpersModule");

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
/** @type {vec3} */
var inputShape;
/** @type {MLComponent} */
var mlComponentLeft;
/** @type {MLComponent} */
var mlComponentRight;
/** @type {OutputPlaceholder[]} */
var outputsLeft;
/** @type {InputPlaceholder[]} */
var inputsLeft;
/** @type {OutputPlaceholder[]} */
var outputsRight;
/** @type {InputPlaceholder[]} */
var inputsRight;
/** @type {number} */
var classCount = classSettings.length;

let onDetectionsUpdatedLeft;
let onDetectionsUpdatedRight;

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
    mlComponentLeft = script.sceneObject.createComponent("MLComponent");
    mlComponentLeft.model = model;
    mlComponentLeft.onLoadingFinished = onLoadingFinishedLeft;
    mlComponentLeft.onRunningFinished = onRunningFinishedLeft;
    mlComponentLeft.inferenceMode = MachineLearning.InferenceMode.Accelerator;
    mlComponentLeft.build([]);

    // 2
    mlComponentRight = script.sceneObject.createComponent("MLComponent");
    mlComponentRight.model = model;
    mlComponentRight.onLoadingFinished = onLoadingFinishedRight;
    mlComponentRight.onRunningFinished = onRunningFinishedRight;
    mlComponentRight.inferenceMode = MachineLearning.InferenceMode.Accelerator;
    mlComponentRight.build([]);
}

/**
 * configures inputs and outputs, starts running ml component
 */
function onLoadingFinishedLeft() {
    outputsLeft = mlComponentLeft.getOutputs();
    inputsLeft = mlComponentLeft.getInputs();

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

    inputsLeft[0].texture = debugTextureOverride ? overrideTexture : cameraTexLeft;
}

function onLoadingFinishedRight() {
    outputsRight = mlComponentRight.getOutputs();
    inputsRight = mlComponentRight.getInputs();

    // set camera texture
    let cameraRequestRight = CameraModule.createCameraRequest();
    cameraRequestRight.cameraId = CameraModule.CameraId.Right_Color;
    let cameraTexRight = cameraModule.requestCamera(cameraRequestRight);

    inputsRight[0].texture = debugTextureOverride ? overrideTexture : cameraTexRight;
}

function onRunningFinishedLeft() {
    parseResults(outputsLeft, true);
}

function onRunningFinishedRight() {
    parseResults(outputsRight, false);
}

// let detectionsLeft;
// let detectionsRight;

function parseResults(outputs, isLeft) {
    [boxes, scores] = parseYolo7Outputs(outputs);

    // Get results
    const results = DetectionHelpers.nms(boxes, scores, scoreThreshold, iouThreshold).sort(
        DetectionHelpers.compareByScoreReversed
    );

    // Convert all results to a detection in the format {label: {...data}}
    // This is used to request the label data more efficiently
    let detections = [];

    for (var i = 0; i < results.length; i++) {
        const result = results[i]; // model output
        const classSetting = classSettings[result.index]; // user defined data

        detections.push({
            label: classSetting.label,
            confidence: result.score,
            bbox: result.bbox,
            nutriScore: classSetting.nutriScore,
        });
    }

    if (isLeft) {
        onDetectionsUpdatedLeft(detections);
    } else {
        onDetectionsUpdatedRight(detections);
    }

    // if (isLeftCamera) {
    //     detectionsLeft = detections;
    // } else {
    //     detectionsRight = detections;
    // }

    // Only trigger when both camera frames are processed
    // if (detectionsLeft && detectionsRight) {
    // onDetectionsUpdatedLeft(detectionsLeft);
    // onDetectionsUpdatedRight(detectionsRight);
    // detectionsLeft = null; // Reset buffer
    // detectionsRight = null; // Reset buffer
    // }
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
    try {
        mlComponenLeft.runImmediate(false);
        mlComponentRight.runImmediate(false);
    } catch (error) {
        print(error);
    }
}

function startContinuous() {
    mlComponentLeft.runScheduled(
        true,
        MachineLearning.FrameTiming.Update,
        // MachineLearning.FrameTiming.Update // This results in incredible amounts of stuffer
        MachineLearning.FrameTiming.None
    );
    mlComponentRight.runScheduled(
        true,
        MachineLearning.FrameTiming.Update,
        // MachineLearning.FrameTiming.Update
        MachineLearning.FrameTiming.None
    );
}

function stopContinuous() {
    mlComponent.stop();
    mlComponentRight.stop();
}

/**
 * returns a number of classes that model detects
 * @returns {number}
 */
// function getClassCount() {
//     return classCount;
// }

// function getClassLabel(index) {
//     return classSettings[index].label ? classSettings[index].label : "class_" + index;
// }

// function getLabels() {
//     return Object.keys(classSettings);
// }
// Initialize
onAwake();

//public api functions
script.onDetectionsUpdated = onDetectionsUpdated;
// script.getClassCount = getClassCount;
// script.getClassLabel = getClassLabel;
// script.getLabels = getLabels;
script.runOnce = runOnce;
script.startContinuous = startContinuous;
script.stopContinuous = stopContinuous;
