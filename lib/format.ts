/* change 48: ONE formatter. Building an Intl.NumberFormat costs far more
   than formatting with one, and the engine formats figures every frame. */
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
export const usd = (n: number) => USD.format(n);
