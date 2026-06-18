import Navbar from "@/components/Navbar";
import Orderbook from "@/components/Orderbook";
import OrderForm from "@/components/OrderForm";
import Positions from "@/components/Positions";
import PriceBar from "../../../components/PriceBar";

export default async function TradePage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar activeMarket={market} />
      <PriceBar market={market} />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 shrink-0 border-r border-gray-800 overflow-y-auto">
          <Orderbook market={market} />
        </div>

        <div className="flex-1 border-r border-gray-800 flex items-center justify-center text-gray-600 text-sm">
          Chart coming soon
        </div>

        <div className="w-72 shrink-0 overflow-y-auto">
          <OrderForm market={market} />
        </div>
      </div>

      <div className="h-48 shrink-0 border-t border-gray-800 overflow-y-auto">
        <Positions market={market} />
      </div>
    </div>
  );
}
