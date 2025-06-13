/*
UIController
*/

// @input Component.ScriptComponent trackletController
const trackletController = script.trackletController;

// @input Component.ScriptComponent nutriScoreSlider
const nutriScoreSlider = script.nutriScoreSlider;

// @input Component.ScriptComponent labelToggle
const labelToggle = script.labelToggle;

// @input Component.ScriptComponent runToggle
const runToggle = script.runToggle;

// @input Component.ScriptComponent memoryToggle
const memoryToggle = script.memoryToggle;

// @input SceneObject effectType0;
const effectType0 = script.effectType0;
// @input SceneObject effectType1;
const effectType1 = script.effectType1;
// @input SceneObject effectType2;
const effectType2 = script.effectType2;
// @input SceneObject effectType3;
const effectType3 = script.effectType3;

// @input SceneObject effectMode0;
const effectMode0 = script.effectMode0;
// @input SceneObject effectMode1;
const effectMode1 = script.effectMode1;
// @input SceneObject effectMode2;
const effectMode2 = script.effectMode2;
// @input SceneObject effectMode3;
const effectMode3 = script.effectMode3;

const store = global.persistentStorageSystem.store;

function onStart() {
    // set slider value from storage
    nutriScoreSlider.currentValue = store.getInt("nutriScore") || 0.0;

    // set radio buttons
    switch (store.getInt("effectType")) {
        case 0:
            setRadioButton(effectType0, true);
            break;
        case 1:
            setRadioButton(effectType1, true);
            break;
        case 2:
            setRadioButton(effectType2, true);
            break;
        case 3:
            setRadioButton(effectType3, true);
            break;
    }

    // set radio buttons
    switch (store.getInt("effectMode")) {
        case 0:
            setRadioButton(effectMode0, true);
            break;
        case 1:
            setRadioButton(effectMode1, true);
            break;
        case 2:
            setRadioButton(effectMode2, true);
            break;
        case 3:
            setRadioButton(effectMode3, true);
            break;
    }

    // set toggle button, without triggering the callback function.
    labelToggle.setStateSilently(store.getInt("showLabels"));
    memoryToggle.setStateSilently(store.getInt("memorizeDetections"));
}

function runContinuous() {
    if (runToggle.isToggledOn) {
        trackletController.startContinuous();
    } else {
        trackletController.stopContinuous();
    }
}

function updateNutriScore() {
    const newNutriScore = nutriScoreSlider.currentValue | 0;
    store.putInt("nutriScore", newNutriScore);
    trackletController.updateTrackletsMaterial();
}

function setRadioButton(button, enabled) {
    button.getChild(0).enabled = enabled;
    // button.getChild(1).enabled = !enabled;
}

/* This code can be improved by using something like updateEffect(value) as the callback function,
where value indicates what button was pressed, instead of having 1 function per button.
*/
function updateEffect0(data) {
    updateEffect(0);

    const obj = data.target.getSceneObject();
    setRadioButton(obj, true);
}
function updateEffect1(data) {
    updateEffect(1);

    const obj = data.target.getSceneObject();
    setRadioButton(obj, true);
}
function updateEffect2(data) {
    updateEffect(2);

    const obj = data.target.getSceneObject();
    setRadioButton(obj, true);
}
function updateEffect3(data) {
    updateEffect(3);

    const obj = data.target.getSceneObject();
    setRadioButton(obj, true);
}

// effect mode
function updateEffectMode0(data) {
    updateEffectMode(0);

    const obj = data.target.getSceneObject();
    setRadioButton(obj, true);
}
function updateEffectMode1(data) {
    updateEffectMode(1);

    const obj = data.target.getSceneObject();
    setRadioButton(obj, true);
}
function updateEffectMode2(data) {
    updateEffectMode(2);

    const obj = data.target.getSceneObject();
    setRadioButton(obj, true);
}
function updateEffectMode3(data) {
    updateEffectMode(3);

    const obj = data.target.getSceneObject();
    setRadioButton(obj, true);
}

// radio buttons
function updateEffect(effectType) {
    store.putInt("effectType", effectType);
    trackletController.updateTrackletsMaterial();

    setRadioButton(effectType0, false);
    setRadioButton(effectType1, false);
    setRadioButton(effectType2, false);
    setRadioButton(effectType3, false);
}

function updateEffectMode(effectMode) {
    store.putInt("effectMode", effectMode);
    trackletController.updateTrackletsMaterial();

    setRadioButton(effectMode0, false);
    setRadioButton(effectMode1, false);
    setRadioButton(effectMode2, false);
    setRadioButton(effectMode3, false);
}
function updateLabelVisibility() {
    store.putInt("showLabels", labelToggle.isToggledOn ? 1 : 0);
    trackletController.updateTrackletsMaterial();
}

function updateDetectionMemory() {
    store.putInt("memorizeDetections", memoryToggle.isToggledOn ? 1 : 0);
    trackletController.toggleDetectionMemory(memoryToggle.isToggledOn);
}

script.createEvent("OnStartEvent").bind(onStart);

script.runOnce = trackletController.runOnce;
script.runContinuous = runContinuous;

script.updateNutriScore = updateNutriScore;
script.updateEffect0 = updateEffect0;
script.updateEffect1 = updateEffect1;
script.updateEffect2 = updateEffect2;
script.updateEffect3 = updateEffect3;
script.updateEffectMode0 = updateEffectMode0;
script.updateEffectMode1 = updateEffectMode1;
script.updateEffectMode2 = updateEffectMode2;
script.updateEffectMode3 = updateEffectMode3;
script.updateLabelVisibility = updateLabelVisibility;
script.updateDetectionMemory = updateDetectionMemory;
