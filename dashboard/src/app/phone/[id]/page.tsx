import Player from '@/components/Player';

export default function PhonePage({ params }: { params: { id: string } }) {
  return <Player id={params.id} />;
}
