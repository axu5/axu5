import Link from "next/link";

export default function Home() {
  return (
    <main>
      <div className='flex flex-col'>
        <h2 className='text-3xl'>Tools</h2>
        <Link href='/bg' className='text-xl hover:underline'>
          Image background remover
        </Link>
        <Link href='/clip-to-download'>
          Clipboard to downloadable image
        </Link>
      </div>
    </main>
  );
}
