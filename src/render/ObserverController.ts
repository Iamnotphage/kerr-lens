export interface ObserverState {
  radius: number;
  inclination: number;
  azimuth: number;
}

interface ControllerCallbacks {
  onChange: (state: ObserverState) => void;
  onInteraction: () => void;
  onFirstInteraction: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class ObserverController {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: ControllerCallbacks;
  private state: ObserverState;
  private pointerId: number | null = null;
  private previousX = 0;
  private previousY = 0;
  private firstInteraction = true;

  constructor(canvas: HTMLCanvasElement, initial: ObserverState, callbacks: ControllerCallbacks) {
    this.canvas = canvas;
    this.state = { ...initial };
    this.callbacks = callbacks;

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  setState(next: Partial<ObserverState>, notify = true): void {
    this.state = {
      radius: clamp(next.radius ?? this.state.radius, 7, 40),
      inclination: clamp(next.inclination ?? this.state.inclination, (5 * Math.PI) / 180, (88 * Math.PI) / 180),
      azimuth: next.azimuth ?? this.state.azimuth,
    };
    if (notify) this.callbacks.onChange({ ...this.state });
  }

  getState(): ObserverState {
    return { ...this.state };
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }

  private noteInteraction(): void {
    this.callbacks.onInteraction();
    if (this.firstInteraction) {
      this.firstInteraction = false;
      this.callbacks.onFirstInteraction();
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerId = event.pointerId;
    this.previousX = event.clientX;
    this.previousY = event.clientY;
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.classList.add("is-dragging");
    this.noteInteraction();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.previousX;
    const dy = event.clientY - this.previousY;
    this.previousX = event.clientX;
    this.previousY = event.clientY;
    this.setState({
      azimuth: this.state.azimuth - dx * 0.0045,
      inclination: this.state.inclination + dy * 0.0037,
    });
    this.noteInteraction();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.canvas.releasePointerCapture(event.pointerId);
    this.canvas.classList.remove("is-dragging");
    this.noteInteraction();
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.setState({ radius: this.state.radius * Math.exp(event.deltaY * 0.001) });
    this.noteInteraction();
  };
}
