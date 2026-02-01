import Compressor from "@/components/Compressor";
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-white flex">
      {/* Left Sidebar - Branding */}
      <div className="w-[30%] h-screen fixed left-0 top-0 flex flex-col items-center justify-center px-12 border-r border-gray-100 bg-white">
        <div className="space-y-6 text-center">
          {/* Smart-Bot Mascot */}
          <div className="flex justify-center -mb-6">
            <Image
              src="/Smart_Bot.png"
              alt="Smart-Bot"
              width={180}
              height={180}
              className="object-contain"
            />
          </div>

          {/* Branding */}
          <h1
            className="font-extrabold leading-none tracking-tight"
            style={{ fontFamily: 'var(--font-montserrat)', fontSize: '108px', lineHeight: '0.85' }}
          >
            Smart<span className="block -mt-8">Press</span>
          </h1>

          <p
            className="text-gray-700 font-medium leading-tight"
            style={{ fontFamily: 'var(--font-montserrat)', fontSize: '24px' }}
          >
            Fast, smart compression for <span className="font-bold">images and video.</span>
          </p>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 ml-[30%] overflow-y-auto h-screen px-12">
        <Compressor />
      </div>
    </main>
  );
}
