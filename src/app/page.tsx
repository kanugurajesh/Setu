import Workspace from "@/components/Workspace";
import { Footer, TopBar } from "@/components/TopBar";

export default function Home() {
  return (
    <>
      <TopBar />
      <main className="shell" id="main">
        <Workspace />
      </main>
      <Footer />
    </>
  );
}
