// @input Component.ScriptComponent instanceController
const instanceController = script.instanceController;

// @input Component.ScriptComponent nutriScoreSlider
const nutriScoreSlider = script.nutriScoreSlider;

// @input SceneObject effectType0;
const effectType0 = script.effectType0;
// @input SceneObject effectType1;
const effectType1 = script.effectType1;
// @input SceneObject effectType2;
const effectType2 = script.effectType2;
// @input SceneObject effectType3;
const effectType3 = script.effectType3;

// @input Component.

const store = global.persistentStorageSystem.store;

function onStart() {
    // set slider value from storage
    nutriScoreSlider.currentValue = store.getInt("nutriScore") || 0.0;

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
}

function calibrate() {
    instanceController.calibrate();
}

function updateNutriScore() {
    const newNutriScore = nutriScoreSlider.currentValue | 0;
    store.putInt("nutriScore", newNutriScore);
    instanceController.updateTrackletsMaterial();
}

function setRadioButton(button, enabled) {
    button.getChild(0).getComponent("Component.Image").enabled = enabled;
    button.getChild(1).getComponent("Component.Image").enabled = !enabled;
}

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

// radio buttons
function updateEffect(effectType) {
    store.putInt("effectType", effectType);
    instanceController.updateTrackletsMaterial();

    setRadioButton(effectType0, false);
    setRadioButton(effectType1, false);
    setRadioButton(effectType2, false);
    setRadioButton(effectType3, false);
}

script.createEvent("OnStartEvent").bind(onStart);
//init();

script.calibrate = calibrate;
script.updateNutriScore = updateNutriScore;
script.updateEffect0 = updateEffect0;
script.updateEffect1 = updateEffect1;
script.updateEffect2 = updateEffect2;
script.updateEffect3 = updateEffect3;
