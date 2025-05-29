// adapted from:
// https://localjoost.github.io/Lens-Studio-Cube-Bouncer-for-the-confused-Unity-developer-add-a-hand-menu/

import { HandInputData } from "../SpectaclesInteractionKit/Providers/HandInputData/HandInputData";
import { HandType } from "../SpectaclesInteractionKit/Providers/HandInputData/HandType";
import TrackedHand from "../SpectaclesInteractionKit/Providers/HandInputData/TrackedHand";
import WorldCameraFinderProvider from "../SpectaclesInteractionKit/Providers/CameraProvider/WorldCameraFinderProvider";

@component
export class HandFollower extends BaseScriptComponent {
    @input private handFollowObject: SceneObject;
    @input private SIKCursors: SceneObject;
    @input private distanceToHand: number = 5;
    @input private minLostFrames: number = 10;

    private handProvider: HandInputData = HandInputData.getInstance();
    private leftHand = this.handProvider.getHand("left" as HandType);
    private rightHand = this.handProvider.getHand("right" as HandType);
    private camera = WorldCameraFinderProvider.getInstance();
    private noTrackCount = 0;

    onAwake() {
        this.createEvent("UpdateEvent").bind(() => {
            this.update();
        });
        this.handFollowObject.enabled = false;
        this.SIKCursors.enabled = false;
    }

    update() {
        if (this.tryShowHandMenu(this.leftHand) || this.tryShowHandMenu(this.rightHand)) {
            this.handFollowObject.enabled = true;
            this.SIKCursors.enabled = true;
            this.noTrackCount = 0;
        } else {
            this.noTrackCount++;
            if (this.noTrackCount > this.minLostFrames) {
                this.handFollowObject.enabled = false;
                this.SIKCursors.enabled = false;
            }
        }
    }

    private tryShowHandMenu(hand: TrackedHand): boolean {
        if (!hand.isTracked()) {
            return false;
        }
        const currentPosition = hand.pinkyKnuckle.position;
        if (currentPosition != null) {
            const knuckleForward = hand.indexKnuckle.forward;
            const cameraForward = this.camera.getTransform().forward;
            const angle =
                (Math.acos(
                    knuckleForward.dot(cameraForward) /
                        (knuckleForward.length * cameraForward.length)
                ) *
                    180.0) /
                Math.PI;
            if (Math.abs(angle) > 20) {
                return false;
            }
            var directionNextToKnuckle =
                hand.handType == "left"
                    ? hand.indexKnuckle.right
                    : hand.indexKnuckle.right.mult(new vec3(-1, -1, -1));

            this.handFollowObject.getTransform().setWorldRotation(hand.indexKnuckle.rotation);
            this.handFollowObject
                .getTransform()
                .setWorldPosition(
                    currentPosition.add(
                        directionNextToKnuckle.mult(
                            new vec3(this.distanceToHand, this.distanceToHand, this.distanceToHand)
                        )
                    )
                );
            return true;
        }
        return false;
    }
}
