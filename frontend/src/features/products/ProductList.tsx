import { useState, type FormEvent } from "react";
import { ApiRefusal } from "../../shared/apiRefusal";
import { messages } from "../../shared/messages";
import { useScreenFocus } from "../../shared/useScreenFocus";
import {
  useAddProduct,
  useAdjustStock,
  useProducts,
  useSetProductActive,
  type Product,
} from "./products";

const REFUSALS: Record<string, string> = {
  INSUFFICIENT_STOCK: messages.insufficientStockError,
  VALIDATION_ERROR: messages.validationError,
};

function refusalMessage(err: unknown): string {
  return (err instanceof ApiRefusal && REFUSALS[err.code]) || messages.genericError;
}

function ProductRow({ product }: { product: Product }) {
  const [delta, setDelta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const adjust = useAdjustStock();
  const setActive = useSetProductActive();

  function apply(event: FormEvent) {
    event.preventDefault();
    const amount = Number(delta);
    if (!Number.isInteger(amount) || amount === 0) {
      setError(messages.validationError);
      return;
    }
    adjust.mutate(
      { id: product.id, delta: amount },
      {
        onSuccess: () => {
          setDelta("");
          setError(null);
        },
        onError: (err) => setError(refusalMessage(err)),
      },
    );
  }

  return (
    <li className="appt">
      <span className="appt-time">
        {product.name}
        {!product.active && <span> ({messages.inactiveProduct})</span>}
      </span>
      <span className="appt-detail">
        {product.unit} · ${product.price} · {messages.quantityLabel}: {product.quantity}
      </span>
      <form
        className="stock-form"
        onSubmit={apply}
        aria-label={`${messages.applyStock}: ${product.name}`}
      >
        <label>
          {messages.stockChangeLabel}
          <input
            type="number"
            inputMode="numeric"
            step="1"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
        </label>
        <button type="submit" disabled={adjust.isPending}>
          {messages.applyStock}
        </button>
      </form>
      {error !== null && <p role="alert">{error}</p>}
      <div className="appt-actions">
        <button
          type="button"
          aria-label={`${product.active ? messages.deactivateService : messages.activateService}: ${product.name}`}
          onClick={() => setActive.mutate({ id: product.id, active: !product.active })}
        >
          {product.active ? messages.deactivateService : messages.activateService}
        </button>
      </div>
    </li>
  );
}

export function ProductList() {
  const heading = useScreenFocus();
  const products = useProducts();
  const add = useAddProduct();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const priceValue = Number(price);
    const quantityValue = Number(quantity);
    if (
      !name ||
      !unit ||
      !Number.isInteger(priceValue) ||
      priceValue < 0 ||
      !Number.isInteger(quantityValue) ||
      quantityValue < 0
    ) {
      setError(messages.validationError);
      return;
    }
    add.mutate(
      { name, unit, price: priceValue, quantity: quantityValue },
      {
        onSuccess: () => {
          setName("");
          setUnit("");
          setPrice("");
          setQuantity("0");
          setError(null);
        },
        onError: (err) => setError(refusalMessage(err)),
      },
    );
  }

  return (
    <section>
      <h1 ref={heading} tabIndex={-1}>
        {messages.productsTitle}
      </h1>
      <form className="form" onSubmit={submit} aria-label={messages.addProduct}>
        <label>
          {messages.productNameLabel}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          {messages.unitLabel}
          <input value={unit} onChange={(e) => setUnit(e.target.value)} required />
        </label>
        <label>
          {messages.priceLabel}
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </label>
        <label>
          {messages.quantityLabel}
          <input
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        {error !== null && <p role="alert">{error}</p>}
        <div className="form-actions">
          <button type="submit" disabled={add.isPending}>
            {messages.addProduct}
          </button>
        </div>
      </form>
      {products.isPending && <p role="status">{messages.loading}</p>}
      {products.isError && <p role="alert">{messages.genericError}</p>}
      {products.data?.length === 0 && <p>{messages.productsEmpty}</p>}
      <ul>
        {products.data?.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </ul>
    </section>
  );
}
