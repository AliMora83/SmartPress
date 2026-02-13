import Compressor from "@/components/Compressor";
import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-white flex flex-col md:flex-row">
      {/* Left Sidebar - Branding */}
      <div className="w-full md:w-[30%] md:h-screen md:fixed md:left-0 md:top-0 flex flex-col items-center justify-center px-6 md:px-12 py-8 md:py-0 border-b md:border-b-0 md:border-r border-gray-100 bg-white">
        <div className="space-y-3 md:space-y-6 text-center">
          {/* Smart-Bot Mascot */}
          <div className="flex justify-center -mb-3 md:-mb-6">
            <Image
              src="/Smart_Bot.png"
              alt="Smart-Bot"
              width={120}
              height={120}
              className="object-contain md:w-[180px] md:h-[180px]"
            />
          </div>

          {/* Branding */}
          <h1
            className="font-extrabold leading-none tracking-tight text-slate-800 text-5xl md:text-[108px]"
            style={{ fontFamily: 'var(--font-montserrat)', lineHeight: '0.85' }}
          >
            Smart<span className="block -mt-4 md:-mt-8">Press</span>
          </h1>

          <p
            className="text-slate-700 font-medium leading-tight text-base md:text-2xl"
            style={{ fontFamily: 'var(--font-montserrat)' }}
          >
            Fast, smart compression for <br className="md:hidden" /> <span className="font-bold">images and video.</span>
          </p>
        </div>
      </div>

      {/* Right Content Area */}
      <div className="flex-1 md:ml-[30%] overflow-y-auto md:h-screen px-4 md:px-12">
        <Compressor />
      </div>
    </main>
  );
}
