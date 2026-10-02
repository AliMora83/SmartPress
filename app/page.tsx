import Compressor from "@/components/Compressor";
import { version } from "../package.json";

export default function Home() {
  return <Compressor version={version} />;
}
