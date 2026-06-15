declare module 'jstat' {
  interface BetaDist {
    sample(alpha: number, beta: number): number;
    pdf(x: number, alpha: number, beta: number): number;
    cdf(x: number, alpha: number, beta: number): number;
  }
  interface JStatStatic {
    beta: BetaDist;
  }
  const jStat: JStatStatic;
  export default jStat;
}
