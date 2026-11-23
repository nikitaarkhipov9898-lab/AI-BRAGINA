import { useRive } from "@rive-app/react-canvas";

function RiveScene({ src }: { src: string }) {
  const { RiveComponent } = useRive({ src, autoplay: true });
  return <RiveComponent aria-hidden="true" style={{ width: "100%", height: "100%" }} />;
}

export default function RiveAccent() {
  const src = import.meta.env.VITE_RIVE_SCENE_URL;
  if (!src) return null;
  return <RiveScene src={src} />;
}
