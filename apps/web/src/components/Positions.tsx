export default function Positions({ market }: { market: string }) {
  return (
    <div className="p-3">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">
        Positions
      </p>
      <p className="text-xs text-gray-600">{market}</p>
    </div>
  );
}
