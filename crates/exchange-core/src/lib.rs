use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderType {
    Limit,
    Market,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeConfig {
    pub tick_size: f64,
    pub maker_fee_bps: f64,
    pub taker_fee_bps: f64,
    pub minimum_resting_ticks: u64,
}

impl Default for ExchangeConfig {
    fn default() -> Self {
        Self {
            tick_size: 0.01,
            maker_fee_bps: -0.1,
            taker_fee_bps: 0.8,
            minimum_resting_ticks: 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderRequest {
    pub agent_id: String,
    pub agent_kind: String,
    pub side: Side,
    #[serde(rename = "type")]
    pub order_type: OrderType,
    pub price: Option<f64>,
    pub quantity: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Order {
    pub id: String,
    pub agent_id: String,
    pub agent_kind: String,
    pub side: Side,
    #[serde(rename = "type")]
    pub order_type: OrderType,
    pub price: f64,
    pub quantity: u64,
    pub remaining: u64,
    pub sequence: u64,
    pub created_tick: u64,
    #[serde(skip)]
    price_ticks: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trade {
    pub id: String,
    pub tick: u64,
    pub price: f64,
    pub quantity: u64,
    pub maker_order_id: String,
    pub taker_order_id: String,
    pub maker_side: Side,
    pub buyer_id: String,
    pub seller_id: String,
    pub buyer_kind: String,
    pub seller_kind: String,
    pub buyer_fee: f64,
    pub seller_fee: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmissionResult {
    pub accepted: bool,
    pub order: Option<Order>,
    pub trades: Vec<Trade>,
    pub rejected_reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancellationResult {
    pub cancelled: bool,
    pub reason: Option<String>,
    pub order: Option<Order>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookLevel {
    pub price: f64,
    pub quantity: u64,
    pub order_count: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueEntry {
    pub order_id: String,
    pub agent_id: String,
    pub agent_kind: String,
    pub side: Side,
    pub price: f64,
    pub remaining: u64,
    pub queue_position: usize,
    pub created_tick: u64,
    pub age_ticks: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookView {
    pub bids: Vec<BookLevel>,
    pub asks: Vec<BookLevel>,
    pub best_bid: Option<f64>,
    pub best_ask: Option<f64>,
    pub spread: Option<f64>,
    pub mid_price: Option<f64>,
    pub bid_queue: Vec<QueueEntry>,
    pub ask_queue: Vec<QueueEntry>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreEvent {
    pub sequence_number: u64,
    pub simulation_timestamp: u64,
    pub event_type: String,
    pub agent_id: Option<String>,
    pub order_id: Option<String>,
    pub parent_order_id: Option<String>,
    pub side: Option<Side>,
    pub price: Option<f64>,
    pub quantity: Option<u64>,
    pub remaining_quantity: Option<u64>,
    pub reason_code: String,
    pub metadata: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct Engine {
    bids: Vec<Order>,
    asks: Vec<Order>,
    sequence: u64,
    order_counter: u64,
    trade_counter: u64,
    event_counter: u64,
    tick: u64,
    halted: bool,
    config: ExchangeConfig,
    events: Vec<CoreEvent>,
}

impl Engine {
    #[must_use]
    pub fn new(config: ExchangeConfig) -> Self {
        Self {
            bids: Vec::new(),
            asks: Vec::new(),
            sequence: 0,
            order_counter: 0,
            trade_counter: 0,
            event_counter: 0,
            tick: 0,
            halted: false,
            config,
            events: Vec::new(),
        }
    }

    pub fn set_tick(&mut self, tick: u64) {
        self.tick = tick;
    }

    pub fn set_config(&mut self, config: ExchangeConfig) -> Result<(), String> {
        Self::validate_config(&config)?;
        self.config = config;
        Ok(())
    }

    pub fn halt(&mut self, reason: &str) {
        self.halted = true;
        self.emit(CoreEventDraft {
            event_type: "TradingHalt",
            reason_code: reason,
            ..CoreEventDraft::default()
        });
    }

    pub fn resume(&mut self, reason: &str) {
        self.halted = false;
        self.emit(CoreEventDraft {
            event_type: "TradingResume",
            reason_code: reason,
            ..CoreEventDraft::default()
        });
    }

    pub fn submit(&mut self, request: OrderRequest) -> SubmissionResult {
        if self.halted {
            return SubmissionResult::rejected("trading halted");
        }
        if let Err(reason) = Self::validate_request(&request) {
            return SubmissionResult::rejected(reason);
        }

        let price_ticks = match request.order_type {
            OrderType::Limit => self.price_to_ticks(request.price.unwrap_or_default()),
            OrderType::Market => match request.side {
                Side::Buy => i64::MAX,
                Side::Sell => 0,
            },
        };
        self.order_counter += 1;
        self.sequence += 1;
        let mut order = Order {
            id: format!("O{}", self.order_counter),
            agent_id: request.agent_id,
            agent_kind: request.agent_kind,
            side: request.side,
            order_type: request.order_type,
            price: if request.order_type == OrderType::Limit {
                self.ticks_to_price(price_ticks)
            } else {
                0.0
            },
            quantity: request.quantity,
            remaining: request.quantity,
            sequence: self.sequence,
            created_tick: self.tick,
            price_ticks,
        };
        self.emit(CoreEventDraft {
            event_type: "NewOrder",
            agent_id: Some(order.agent_id.clone()),
            order_id: Some(order.id.clone()),
            side: Some(order.side),
            price: (order.order_type == OrderType::Limit).then_some(order.price),
            quantity: Some(order.quantity),
            remaining_quantity: Some(order.remaining),
            reason_code: "accepted",
            metadata: serde_json::json!({
                "agentKind": order.agent_kind,
                "orderType": order.order_type,
            }),
            ..CoreEventDraft::default()
        });

        let trades = self.match_order(&mut order);
        if order.remaining > 0 && order.order_type == OrderType::Limit {
            let side = order.side;
            self.side_orders_mut(side).push(order.clone());
            self.sort_side(side);
            self.emit(CoreEventDraft {
                event_type: "QuoteUpdated",
                agent_id: Some(order.agent_id.clone()),
                order_id: Some(order.id.clone()),
                side: Some(order.side),
                price: Some(order.price),
                quantity: Some(order.quantity),
                remaining_quantity: Some(order.remaining),
                reason_code: "resting",
                ..CoreEventDraft::default()
            });
        } else if order.remaining == 0 {
            self.emit(CoreEventDraft {
                event_type: "OrderExpired",
                agent_id: Some(order.agent_id.clone()),
                order_id: Some(order.id.clone()),
                remaining_quantity: Some(0),
                reason_code: "fully_filled",
                ..CoreEventDraft::default()
            });
        } else {
            self.emit(CoreEventDraft {
                event_type: "OrderExpired",
                agent_id: Some(order.agent_id.clone()),
                order_id: Some(order.id.clone()),
                remaining_quantity: Some(order.remaining),
                reason_code: "market_remainder_cancelled",
                ..CoreEventDraft::default()
            });
        }
        SubmissionResult {
            accepted: true,
            order: Some(order),
            trades,
            rejected_reason: None,
        }
    }

    pub fn cancel(&mut self, order_id: &str, agent_id: &str) -> CancellationResult {
        let tick = self.tick;
        let minimum_resting_ticks = self.config.minimum_resting_ticks;
        for side in [Side::Buy, Side::Sell] {
            let orders = self.side_orders_mut(side);
            let Some(index) = orders.iter().position(|order| order.id == order_id) else {
                continue;
            };
            if orders[index].agent_id != agent_id {
                return CancellationResult::rejected("owner mismatch");
            }
            if tick.saturating_sub(orders[index].created_tick) < minimum_resting_ticks {
                return CancellationResult::rejected("minimum resting time active");
            }
            let order = orders.remove(index);
            self.emit(CoreEventDraft {
                event_type: "CancelOrder",
                agent_id: Some(order.agent_id.clone()),
                order_id: Some(order.id.clone()),
                side: Some(order.side),
                price: Some(order.price),
                quantity: Some(order.quantity),
                remaining_quantity: Some(order.remaining),
                reason_code: "participant_cancel",
                ..CoreEventDraft::default()
            });
            return CancellationResult {
                cancelled: true,
                reason: None,
                order: Some(order),
            };
        }
        CancellationResult::rejected("order not found")
    }

    pub fn replace(
        &mut self,
        order_id: &str,
        agent_id: &str,
        price: f64,
        quantity: u64,
    ) -> SubmissionResult {
        let cancellation = self.cancel(order_id, agent_id);
        let Some(cancelled) = cancellation.order else {
            return SubmissionResult::rejected(
                cancellation
                    .reason
                    .unwrap_or_else(|| "replace rejected".to_string()),
            );
        };
        self.emit(CoreEventDraft {
            event_type: "ReplaceOrder",
            agent_id: Some(agent_id.to_string()),
            order_id: Some(cancelled.id.clone()),
            parent_order_id: Some(cancelled.id.clone()),
            side: Some(cancelled.side),
            price: Some(price),
            quantity: Some(quantity),
            reason_code: "participant_replace",
            ..CoreEventDraft::default()
        });
        self.submit(OrderRequest {
            agent_id: agent_id.to_string(),
            agent_kind: cancelled.agent_kind,
            side: cancelled.side,
            order_type: OrderType::Limit,
            price: Some(price),
            quantity,
        })
    }

    #[must_use]
    pub fn orders(&self, agent_id: Option<&str>) -> Vec<Order> {
        self.bids
            .iter()
            .chain(self.asks.iter())
            .filter(|order| agent_id.is_none_or(|id| order.agent_id == id))
            .cloned()
            .collect()
    }

    #[must_use]
    pub fn view(&self, level_count: usize) -> BookView {
        let bids = self.levels(&self.bids, level_count);
        let asks = self.levels(&self.asks, level_count);
        let best_bid = bids.first().map(|level| level.price);
        let best_ask = asks.first().map(|level| level.price);
        let spread = best_bid.zip(best_ask).map(|(bid, ask)| round(ask - bid));
        let mid_price = best_bid
            .zip(best_ask)
            .map(|(bid, ask)| round((bid + ask) / 2.0));
        BookView {
            bids,
            asks,
            best_bid,
            best_ask,
            spread,
            mid_price,
            bid_queue: self.queue(&self.bids),
            ask_queue: self.queue(&self.asks),
        }
    }

    #[must_use]
    pub fn events(&self) -> &[CoreEvent] {
        &self.events
    }

    pub fn drain_events(&mut self) -> Vec<CoreEvent> {
        std::mem::take(&mut self.events)
    }

    fn validate_config(config: &ExchangeConfig) -> Result<(), String> {
        if !config.tick_size.is_finite() || config.tick_size <= 0.0 {
            return Err("tick size must be positive and finite".to_string());
        }
        if !config.maker_fee_bps.is_finite() || !config.taker_fee_bps.is_finite() {
            return Err("fees must be finite".to_string());
        }
        Ok(())
    }

    fn validate_request(request: &OrderRequest) -> Result<(), String> {
        if request.quantity == 0 {
            return Err("quantity must be positive".to_string());
        }
        if request.order_type == OrderType::Limit
            && request
                .price
                .is_none_or(|price| !price.is_finite() || price <= 0.0)
        {
            return Err("limit price must be positive and finite".to_string());
        }
        Ok(())
    }

    fn match_order(&mut self, incoming: &mut Order) -> Vec<Trade> {
        let mut trades = Vec::new();
        while incoming.remaining > 0 {
            let maker = {
                let opposite = match incoming.side {
                    Side::Buy => &mut self.asks,
                    Side::Sell => &mut self.bids,
                };
                let Some(candidate) = opposite.first_mut() else {
                    break;
                };
                if !Self::crosses(incoming, candidate) {
                    break;
                }
                let quantity = incoming.remaining.min(candidate.remaining);
                candidate.remaining -= quantity;
                let maker = candidate.clone();
                if candidate.remaining == 0 {
                    opposite.remove(0);
                }
                (maker, quantity)
            };
            incoming.remaining -= maker.1;
            let trade = self.make_trade(incoming, &maker.0, maker.1);
            let event_type = if incoming.remaining > 0 {
                "PartialFill"
            } else {
                "Trade"
            };
            self.emit(CoreEventDraft {
                event_type,
                agent_id: Some(incoming.agent_id.clone()),
                order_id: Some(incoming.id.clone()),
                parent_order_id: Some(maker.0.id.clone()),
                side: Some(incoming.side),
                price: Some(trade.price),
                quantity: Some(trade.quantity),
                remaining_quantity: Some(incoming.remaining),
                reason_code: "price_time_match",
                metadata: serde_json::json!({
                    "tradeId": trade.id,
                    "makerOrderId": trade.maker_order_id,
                    "takerOrderId": trade.taker_order_id,
                }),
            });
            trades.push(trade);
        }
        trades
    }

    fn make_trade(&mut self, incoming: &Order, maker: &Order, quantity: u64) -> Trade {
        self.trade_counter += 1;
        let (buyer, seller) = if incoming.side == Side::Buy {
            (incoming, maker)
        } else {
            (maker, incoming)
        };
        let notional = maker.price * quantity as f64;
        let maker_fee = round(notional * self.config.maker_fee_bps / 10_000.0);
        let taker_fee = round(notional * self.config.taker_fee_bps / 10_000.0);
        Trade {
            id: format!("T{}", self.trade_counter),
            tick: self.tick,
            price: maker.price,
            quantity,
            maker_order_id: maker.id.clone(),
            taker_order_id: incoming.id.clone(),
            maker_side: maker.side,
            buyer_id: buyer.agent_id.clone(),
            seller_id: seller.agent_id.clone(),
            buyer_kind: buyer.agent_kind.clone(),
            seller_kind: seller.agent_kind.clone(),
            buyer_fee: if buyer.id == maker.id {
                maker_fee
            } else {
                taker_fee
            },
            seller_fee: if seller.id == maker.id {
                maker_fee
            } else {
                taker_fee
            },
        }
    }

    fn crosses(incoming: &Order, maker: &Order) -> bool {
        incoming.order_type == OrderType::Market
            || match incoming.side {
                Side::Buy => incoming.price_ticks >= maker.price_ticks,
                Side::Sell => incoming.price_ticks <= maker.price_ticks,
            }
    }

    fn sort_side(&mut self, side: Side) {
        self.side_orders_mut(side).sort_by(|left, right| {
            let price_order = match side {
                Side::Buy => right.price_ticks.cmp(&left.price_ticks),
                Side::Sell => left.price_ticks.cmp(&right.price_ticks),
            };
            price_order.then(left.sequence.cmp(&right.sequence))
        });
    }

    fn side_orders_mut(&mut self, side: Side) -> &mut Vec<Order> {
        match side {
            Side::Buy => &mut self.bids,
            Side::Sell => &mut self.asks,
        }
    }

    fn levels(&self, orders: &[Order], level_count: usize) -> Vec<BookLevel> {
        let mut levels: Vec<BookLevel> = Vec::new();
        for order in orders {
            if let Some(level) = levels.iter_mut().find(|level| level.price == order.price) {
                level.quantity += order.remaining;
                level.order_count += 1;
            } else if levels.len() < level_count {
                levels.push(BookLevel {
                    price: order.price,
                    quantity: order.remaining,
                    order_count: 1,
                });
            }
        }
        levels
    }

    fn queue(&self, orders: &[Order]) -> Vec<QueueEntry> {
        orders
            .iter()
            .enumerate()
            .map(|(index, order)| QueueEntry {
                order_id: order.id.clone(),
                agent_id: order.agent_id.clone(),
                agent_kind: order.agent_kind.clone(),
                side: order.side,
                price: order.price,
                remaining: order.remaining,
                queue_position: orders[..index]
                    .iter()
                    .filter(|candidate| candidate.price_ticks == order.price_ticks)
                    .count()
                    + 1,
                created_tick: order.created_tick,
                age_ticks: self.tick.saturating_sub(order.created_tick),
            })
            .collect()
    }

    fn price_to_ticks(&self, price: f64) -> i64 {
        (price / self.config.tick_size).round() as i64
    }

    fn ticks_to_price(&self, ticks: i64) -> f64 {
        round(ticks as f64 * self.config.tick_size)
    }

    fn emit(&mut self, draft: CoreEventDraft<'_>) {
        self.event_counter += 1;
        self.events.push(CoreEvent {
            sequence_number: self.event_counter,
            simulation_timestamp: self.tick,
            event_type: draft.event_type.to_string(),
            agent_id: draft.agent_id,
            order_id: draft.order_id,
            parent_order_id: draft.parent_order_id,
            side: draft.side,
            price: draft.price,
            quantity: draft.quantity,
            remaining_quantity: draft.remaining_quantity,
            reason_code: draft.reason_code.to_string(),
            metadata: draft.metadata,
        });
    }
}

#[derive(Default)]
struct CoreEventDraft<'a> {
    event_type: &'a str,
    agent_id: Option<String>,
    order_id: Option<String>,
    parent_order_id: Option<String>,
    side: Option<Side>,
    price: Option<f64>,
    quantity: Option<u64>,
    remaining_quantity: Option<u64>,
    reason_code: &'a str,
    metadata: serde_json::Value,
}

impl SubmissionResult {
    fn rejected(reason: impl Into<String>) -> Self {
        Self {
            accepted: false,
            order: None,
            trades: Vec::new(),
            rejected_reason: Some(reason.into()),
        }
    }
}

impl CancellationResult {
    fn rejected(reason: impl Into<String>) -> Self {
        Self {
            cancelled: false,
            reason: Some(reason.into()),
            order: None,
        }
    }
}

fn round(value: f64) -> f64 {
    (value * 100_000_000.0).round() / 100_000_000.0
}

fn parse_json<T: for<'de> Deserialize<'de>>(value: &str) -> Result<T, JsError> {
    serde_json::from_str(value).map_err(|error| JsError::new(&error.to_string()))
}

fn to_json<T: Serialize>(value: &T) -> Result<String, JsError> {
    serde_json::to_string(value).map_err(|error| JsError::new(&error.to_string()))
}

#[wasm_bindgen]
pub struct ExchangeCore {
    engine: Engine,
}

#[wasm_bindgen]
impl ExchangeCore {
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<ExchangeCore, JsError> {
        let config: ExchangeConfig = parse_json(config_json)?;
        Engine::validate_config(&config).map_err(|error| JsError::new(&error))?;
        Ok(Self {
            engine: Engine::new(config),
        })
    }

    pub fn set_tick(&mut self, tick: u64) {
        self.engine.set_tick(tick);
    }

    pub fn set_config(&mut self, config_json: &str) -> Result<(), JsError> {
        let config: ExchangeConfig = parse_json(config_json)?;
        self.engine
            .set_config(config)
            .map_err(|error| JsError::new(&error))
    }

    pub fn submit(&mut self, request_json: &str) -> Result<String, JsError> {
        to_json(&self.engine.submit(parse_json(request_json)?))
    }

    pub fn cancel(&mut self, order_id: &str, agent_id: &str) -> Result<String, JsError> {
        to_json(&self.engine.cancel(order_id, agent_id))
    }

    pub fn replace(
        &mut self,
        order_id: &str,
        agent_id: &str,
        price: f64,
        quantity: u64,
    ) -> Result<String, JsError> {
        to_json(&self.engine.replace(order_id, agent_id, price, quantity))
    }

    pub fn orders(&self, agent_id: Option<String>) -> Result<String, JsError> {
        to_json(&self.engine.orders(agent_id.as_deref()))
    }

    pub fn view(&self, level_count: usize) -> Result<String, JsError> {
        to_json(&self.engine.view(level_count))
    }

    pub fn halt(&mut self, reason: &str) {
        self.engine.halt(reason);
    }

    pub fn resume(&mut self, reason: &str) {
        self.engine.resume(reason);
    }

    pub fn drain_events(&mut self) -> Result<String, JsError> {
        to_json(&self.engine.drain_events())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn request(agent: &str, side: Side, price: f64, quantity: u64) -> OrderRequest {
        OrderRequest {
            agent_id: agent.to_string(),
            agent_kind: "test".to_string(),
            side,
            order_type: OrderType::Limit,
            price: Some(price),
            quantity,
        }
    }

    fn market(agent: &str, side: Side, quantity: u64) -> OrderRequest {
        OrderRequest {
            agent_id: agent.to_string(),
            agent_kind: "test".to_string(),
            side,
            order_type: OrderType::Market,
            price: None,
            quantity,
        }
    }

    #[test]
    fn better_price_executes_before_worse_price() {
        let mut engine = Engine::new(ExchangeConfig::default());
        engine.submit(request("worse", Side::Sell, 101.0, 5));
        engine.submit(request("better", Side::Sell, 100.0, 5));
        let result = engine.submit(market("buyer", Side::Buy, 6));
        assert_eq!(result.trades[0].seller_id, "better");
        assert_eq!(result.trades[1].seller_id, "worse");
    }

    #[test]
    fn equal_price_respects_fifo() {
        let mut engine = Engine::new(ExchangeConfig::default());
        engine.submit(request("first", Side::Sell, 100.0, 2));
        engine.submit(request("second", Side::Sell, 100.0, 2));
        let result = engine.submit(market("buyer", Side::Buy, 3));
        assert_eq!(result.trades[0].seller_id, "first");
        assert_eq!(result.trades[1].seller_id, "second");
    }

    #[test]
    fn cancellation_and_replacement_are_deterministic() {
        let mut engine = Engine::new(ExchangeConfig {
            minimum_resting_ticks: 0,
            ..ExchangeConfig::default()
        });
        let order = engine
            .submit(request("a", Side::Buy, 99.0, 5))
            .order
            .unwrap();
        assert!(engine.cancel(&order.id, "wrong").order.is_none());
        let replacement = engine.replace(&order.id, "a", 98.0, 4);
        assert!(replacement.accepted);
        assert_eq!(engine.view(5).best_bid, Some(98.0));
    }

    #[test]
    fn trading_halt_rejects_orders_until_resume() {
        let mut engine = Engine::new(ExchangeConfig::default());
        engine.halt("test");
        assert_eq!(
            engine
                .submit(request("a", Side::Buy, 99.0, 5))
                .rejected_reason,
            Some("trading halted".to_string())
        );
        engine.resume("test");
        assert!(engine.submit(request("a", Side::Buy, 99.0, 5)).accepted);
    }

    #[test]
    fn queue_positions_are_price_level_specific() {
        let mut engine = Engine::new(ExchangeConfig::default());
        engine.submit(request("a", Side::Buy, 100.0, 3));
        engine.submit(request("b", Side::Buy, 100.0, 3));
        engine.submit(request("c", Side::Buy, 99.0, 3));
        let queue = engine.view(5).bid_queue;
        assert_eq!(
            queue
                .iter()
                .map(|entry| entry.queue_position)
                .collect::<Vec<_>>(),
            vec![1, 2, 1]
        );
    }

    #[test]
    fn partial_fill_updates_and_full_fill_removes_resting_order() {
        let mut engine = Engine::new(ExchangeConfig::default());
        engine.submit(request("seller", Side::Sell, 100.0, 5));
        let partial = engine.submit(market("buyer-a", Side::Buy, 3));
        assert_eq!(partial.trades[0].quantity, 3);
        assert_eq!(engine.view(5).ask_queue[0].remaining, 2);

        let completed = engine.submit(market("buyer-b", Side::Buy, 4));
        assert_eq!(completed.trades[0].quantity, 2);
        assert_eq!(completed.order.unwrap().remaining, 2);
        assert!(engine.view(5).asks.is_empty());
    }

    #[test]
    fn maker_and_taker_fees_follow_configured_economics() {
        let mut engine = Engine::new(ExchangeConfig::default());
        engine.submit(request("seller", Side::Sell, 100.0, 10));
        let trade = engine.submit(market("buyer", Side::Buy, 10)).trades[0].clone();
        assert_eq!(trade.seller_fee, -0.01);
        assert_eq!(trade.buyer_fee, 0.08);
    }

    proptest! {
        #[test]
        fn submitted_quantity_is_conserved(resting in 1_u64..1_000, incoming in 1_u64..1_000) {
            let mut engine = Engine::new(ExchangeConfig::default());
            engine.submit(request("seller", Side::Sell, 100.0, resting));
            let result = engine.submit(market("buyer", Side::Buy, incoming));
            let executed: u64 = result.trades.iter().map(|trade| trade.quantity).sum();
            prop_assert_eq!(executed + result.order.unwrap().remaining, incoming);
            prop_assert!(executed <= resting);
        }

        #[test]
        fn matching_never_leaves_a_crossed_book(
            bid in 1_u32..20_000,
            ask in 1_u32..20_000,
            bid_qty in 1_u64..100,
            ask_qty in 1_u64..100,
        ) {
            let mut engine = Engine::new(ExchangeConfig::default());
            engine.submit(request("buyer", Side::Buy, f64::from(bid) / 100.0, bid_qty));
            engine.submit(request("seller", Side::Sell, f64::from(ask) / 100.0, ask_qty));
            let view = engine.view(5);
            if let (Some(best_bid), Some(best_ask)) = (view.best_bid, view.best_ask) {
                prop_assert!(best_bid < best_ask);
            }
        }
    }
}
