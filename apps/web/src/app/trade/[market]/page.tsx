import Navbar from "@/components/Navbar";
import LeftPanel from "@/components/LeftPanel";
import OrderForm from "@/components/OrderForm";
import Positions from "@/components/Positions";
import PriceBar from "@/components/PriceBar";
import Chart from "@/components/Chart";

export default async function TradePage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg animate-fade-in">
      <Navbar activeMarket={market} />
      <PriceBar market={market} />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="w-56 shrink-0 border-r border-line overflow-hidden flex flex-col">
          <LeftPanel market={market} />
        </div>

        <div className="flex-1 overflow-hidden min-w-0">
          <Chart market={market} />
        </div>

        <div className="w-[268px] shrink-0 overflow-y-auto border-l border-line">
          <OrderForm market={market} />
        </div>
      </div>

      <div className="h-44 shrink-0 overflow-hidden border-t border-line">
        <Positions market={market} />
      </div>
    </div>
  );
}
