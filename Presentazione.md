# 1. Introduzione e Motivazione del Problema
- **1.1 Limiti dei modelli discreti tradizionali nell'allenamento:**
  - Criticità dell'approccio scalare classico (Volume = Serie × Reps, Tonnellaggio grezzo = Serie × Reps × Carico).
  - Incapacità di modellare la variazione continua del braccio di leva, del profilo di resistenza e dell'affaticamento neuromuscolare intrinseco.
- **1.2 Formulazione del problema numerico:**
  - Transizione da variabili discrete a campi funzionali continui lungo il Range of Motion (ROM, $t \in [0, 1]$).
  - Trattazione dell'ottimizzazione del piano di allenamento come problema di minimo globale multiobiettivo vincolato su spazio discreto combinatorio.
- **1.3 Obiettivi di Calcolo Scientifico e Metodi Numerici:**
  - Studio dell'accuratezza e della stabilità dell'approssimazione funzionale (Bézier vs Spline vs Lagrange).
  - Conservazione dell'energia/magnitudo tramite quadratura numerica composita dei trapezi.
  - Efficienza algoritmica, adimensionalizzazione dei gradienti stocastici e convergenza euristica.

---

# 2. Models (Modellazione e Approssimazione Funzionale)

## 2.1 Formalizzazione della Classe Esercizio
- **Vettore dei parametri biomeccanici:**
  - $c_{load} \in (0, 1]$: coefficiente adimensionale di efficienza articolare e dispersione del carico.
  - $f_{base} \in [1, 10]$: coefficiente intrinseco di affaticamento sistemico/tessutale dell'esercizio.
  - $\mu_{load} \in \mathbb{R}^+, q_{load} \in \mathbb{R}$: moltiplicatore e offset di correzione del carico effettivo ($L = L_{nom} \cdot \mu_{load} + q_{load}$).
  - $is\_isolation \in \{0, 1\}$: flag booleano di isolamento monoarticolare.
- **Vettore di ripartizione muscolare e vincolo di conservazione:**
  - Insieme dei sotto-muscoli target $\mathcal{M} = \{m_1, m_2, \dots, m_k\}$.
  - Vettore delle magnitudo $\mathbf{M} = [M_1, M_2, \dots, M_k]^T$.
  - Vincolo di normalizzazione rigida: $\sum_{m \in \mathcal{M}} M_m = 1.0 \pm \varepsilon$ (con $\varepsilon \le 10^{-4}$).

## 2.2 Analisi Numerica delle Curve di Tensione
- **Confronto teorico e matematico tra metodi di approssimazione/interpolazione:**
  1. *Interpolazione polinomiale di Lagrange/Newton:*
     - Matrice di Vandermonde $V$ associata e divergenza del numero di condizionamento $\kappa(V) \to \infty$.
     - Insorgenza del **Fenomeno di Runge** a estremi liberi con nodi equispaziati ($\lim_{n \to \infty} \max |f(x) - p_n(x)| = \infty$).
  2. *Spline Cubiche Interpolanti ($C^2$):*
     - Risoluzione del sistema lineare tridiagonale $A \mathbf{m} = \mathbf{d}$ tramite algoritmo di Thomas in tempo $\mathcal{O}(n)$.
     - Limitazione pratica: comparsa di overshoot locali con valori di tensione negativi non fisici ($y(t) < 0$).
  3. *Curve Parametriche di Bézier di grado 3 (Polinomi di Bernstein):*
     - Definizione formale: $\mathbf{P}(t) = \sum_{i=0}^3 \mathbf{P}_i B_{i,3}(t)$ con $B_{i,3}(t) = \binom{3}{i} t^i (1-t)^{3-i}$.
     - Proprietà chiave:
       - **Partizione dell'unità:** $\sum_{i=0}^3 B_{i,3}(t) \equiv 1 \quad \forall t \in [0, 1]$.
       - **Positività e Inviluppo Convesso:** $B_{i,3}(t) \ge 0 \implies$ la curva giace interamente nel convex hull dei punti di controllo, garantendo rigorosamente $y(t) \ge 0$.
       - **Stabilità e Complessità $\mathcal{O}(1)$:** Calcolo diretto o tramite algoritmo di De Casteljau a 4 nodi.
- **Studio sperimentale e visualizzazione (Plot Python):**
  - Grafico comparativo delle tre metodologie applicate a un esercizio campione fissato per evidenziare oscillazioni, stabilità ed efficienza.

## 2.3 Quadratura Numerica e Normalizzazione di Scala
- **Calcolo dell'Area Sotto la Curva (AUC):**
  - Integrazione definita su griglia discreta equispaziata a risoluzione $N=50$ ($h = \Delta t = 1/(N-1)$):
    $$I_{trap} = \int_{x_0}^{x_3} y(x)\,dx \approx \sum_{k=0}^{N-2} \frac{y(t_k) + y(t_{k+1})}{2} (t_{k+1} - t_k)$$
  - Studio dell'errore di troncamento della formula composita dei trapezi:
    $$E_{trap} = -\frac{(b-a)^3}{12 (N-1)^2} y''(\xi), \quad \xi \in [0, 1] \implies \mathcal{O}(h^2)$$
- **Operatore di riscalamento vincolato:**
  - Trasformazione funzionale per garantire l'esatta quota di magnitudo imposta:
    $$\tilde{y}(t) = \begin{cases} y(t) \cdot \frac{M}{I_{trap}} & \text{se } I_{trap} > 0 \\ \mathbf{0} & \text{altrimenti} \end{cases} \implies \int_0^1 \tilde{y}(t)\,dt = M + \mathcal{O}(h^2)$$

---

# 3. Analizzatore (Dinamica Discreta e Metriche di Carico)

Spiegazione matematica rigorosa di tutte le statistiche calcolate, presentate rigorosamente nel seguente ordine:

## 3.1 Volume ($V$ ed Effective Volume $V_{eff}$)
- Sia $R_{base}$ il numero di ripetizioni base, $R_{ass}$ le assistite ($c_{ass} = 0.5$) e $R_{part}$ le parziali ($c_{part} = 0.33$).
- Ripetizioni totali equivalenti di una serie $s$:
  $$R_{tot, s} = R_{base, s} + c_{ass} R_{ass, s} + c_{part} R_{part, s}$$
- Ripetizioni efficaci derivate dalla scala $RPE \in [0, 10]$ (dove $RPE=10$ indica 0 ripetizioni di riserva, e lo stimolo efficace subentra a $RPE \ge 5$):
  $$R_{eff, s} = \min\Big(R_{base, s}, \, \max\big(0, \, RPE_s - 4.0\big)\Big) + c_{ass} R_{ass, s} + c_{part} R_{part, s}$$
- Aggregazione proiettata sulla quota muscolare $\Omega_m = \int \tilde{y}_m(t) dt$:
  $$V = \sum_{s} R_{tot, s} \cdot \Omega_m, \qquad V_{eff} = \sum_{s} R_{eff, s} \cdot \Omega_m$$

## 3.2 Tonnellaggio ($T$ ed Effective Tonnage $T_{eff}$)
- Calcolo del carico reale trasferito: $L_s = L_{nom, s} \cdot \mu_{load} + q_{load}$.
- Formule di accumulo:
  $$T = \sum_{s} (L_s \cdot R_{tot, s}) \cdot \Omega_m, \qquad T_{eff} = \sum_{s} (L_s \cdot R_{eff, s}) \cdot \Omega_m$$

## 3.3 Tonnellaggio Ponderato ($T_w$ ed Effective Weighted Tonnage $T_{w,eff}$)
- Ponderazione tramite coefficiente biomeccanico articolare $c_{load}$:
  $$T_w = \sum_{s} (L_s \cdot R_{tot, s} \cdot c_{load}) \cdot \Omega_m, \qquad T_{w,eff} = \sum_{s} (L_s \cdot R_{eff, s} \cdot c_{load}) \cdot \Omega_m$$

## 3.4 TUT - Time Under Tension (Globale ed Effective basato su $RPE$)
- Tempo base della singola ripetizione: $\tau_0 = t_{conc} + t_{iso,short} + t_{ecc} + t_{iso,leng}$.
- **Modello di rallentamento concentrico per affaticamento istantaneo:**
  Per la $j$-esima ripetizione base ($j \in \{0, \dots, R_{base}-1\}$), l'indice di sforzo istantaneo è $\Delta_{RPE}(j) = RPE - (R_{base} - 1 - j)$.
  $$\delta(j, RPE) = \begin{cases} 
  1.60\,\text{s} & \text{se } \Delta_{RPE} > 9.0 \quad (\text{grind al cedimento}) \\
  1.00\,\text{s} & \text{se } 8.0 < \Delta_{RPE} \le 9.0 \\
  0.60\,\text{s} & \text{se } 7.0 < \Delta_{RPE} \le 8.0 \\
  0.35\,\text{s} & \text{se } 6.0 < \Delta_{RPE} \le 7.0 \\
  0.15\,\text{s} & \text{se } 5.0 < \Delta_{RPE} \le 6.0 \\
  0.00\,\text{s} & \text{se } \Delta_{RPE} \le 5.0 
  \end{cases}$$
- **TUT Globale:**
  $$\text{TUT}_{set} = \sum_{j=0}^{R_{base}-1} \big(\tau_0 + \delta(j, RPE)\big) + R_{ass}\tau_0 + R_{part}(0.5\tau_0), \qquad \text{TUT}_{tot} = \sum_{s} \text{TUT}_{set, s} \cdot \Omega_m$$
- **TUT Efficace ($\text{TUT}_{eff}$):**
  Somma ristretta alle sole ultime $k = \operatorname{round}(R_{eff,base})$ ripetizioni della serie (più assistite e parziali):
  $$\text{TUT}_{eff} = \sum_s \left( \sum_{j=R_{base}-k}^{R_{base}-1} \big(\tau_0 + \delta(j, RPE)\big) + R_{ass}\tau_0 + R_{part}(0.5\tau_0) \right) \cdot \Omega_m$$

## 3.5 Sets ($S$)
- Conteggio frazionario delle serie dedicate al target muscolare:
  $$S = \sum_{s} 1 \cdot \Omega_m$$

## 3.6 Fatigue ($F$)
- Modello esponenziale discreto che integra durata reale, fatica dell'esercizio $f_{base}$, carico $c_{load}$ e moltiplicatore esponenziale di sforzo $1.1^{(\Delta_{RPE} - 7.5)}$:
  $$F_{base\_rep}(j) = \big(\tau_0 + \delta(j, RPE)\big) \cdot (1.1)^{\max(0, \, \Delta_{RPE}(j) - 7.5)} \cdot f_{base} \cdot c_{load}$$
  $$F_{set} = \sum_{j=0}^{R_{base}-1} F_{base\_rep}(j) + \big(R_{ass} \tau_0 \cdot 1.1^{-0.5} \cdot f_{base} c_{load} c_{ass}\big) + \big(R_{part} (0.5\tau_0) \cdot 1.0 \cdot f_{base} c_{load} \frac{c_{part}}{0.5}\big)$$
  $$F_{tot} = \sum_{s} F_{set, s} \cdot \Omega_m$$

## 3.7 Curve di Tensione Cumulative Muscolari ($V_m(t)$)
- **Modellazione dell'accumulo funzionale su griglia continua $t \in [0, 1]$:**
  Sia $\tilde{\mathbf{y}}_{e,m}(t)$ la curva normalizzata di Bézier dell'esercizio $e$ per il muscolo $m$.
- **Logica delle mezze ripetizioni (Partials in massimo allungamento):**
  Le ripetizioni parziali operano esclusivamente nel primo terzo del ROM ($t \in [0, 0.333]$). Si introduce la funzione indicatrice/maschera di troncamento:
  $$\chi_{part}(t) = \begin{cases} 1 & \text{se } t \in [0, \, 0.333] \\ 0 & \text{se } t \in (0.333, \, 1.0] \end{cases}$$
- **Equazione della Curva Cumulativa Totale:**
  $$V_m(t) = \sum_{e \in \text{Workout}} \Big( R_{base, e} \cdot \tilde{\mathbf{y}}_{e,m}(t) + R_{part, e} \cdot \tilde{\mathbf{y}}_{e,m}(t) \cdot \chi_{part}(t) \Big)$$
- Dimostrazione dell'effetto di accumulo asimmetrico indotto dalle mezze ripetizioni nella porzione di stretch.

---

# 4. Solver (Ottimizzazione Euristica Globale)

## 4.1 Formulazione del Problema di Minimo Discreto Vincolato
- **Spazio di ricerca combinatorio $\mathcal{S}$:**
  Configurazione $\mathbf{x} = \{ \text{giorni } d \in [1, D], \text{esercizi } e \in [N_{min}, N_{max}], \text{serie } s \in [S_{min}, S_{max}], \text{reps } r, \text{RPE} \}$.
- **Funzione Costo Multiobiettivo Pesata:**
  $$f(\mathbf{x}) = 10000 \cdot \sum_{i \in \text{Metriche}} w_i \frac{E_i(\mathbf{x})}{\sigma_i} + 1000 \cdot P_{penalties}(\mathbf{x})$$
- **Formalizzazione analitica rigorosa dei singoli termini d'errore ($E_i$):**
  1. *Errore di Profilo di Tensione ($L_2$-norm discreta su curva target normalizzata):*
     $$E_{curva} = \frac{1}{|\mathcal{M}_{attivi}|} \sum_{m \in \mathcal{M}_{attivi}} \frac{1}{N} \sum_{k=1}^N \left( \frac{V_m(t_k)}{\max_j V_m(t_j)} - T_m(t_k) \right)^2$$
  2. *Errori sui Rapporti di Efficacia (Scarto quadratico su target prefissati $r_{target} = 0.70$):*
     $$E_{vol} = \left( \frac{V_{eff}}{V} - r_{vol}^* \right)^2, \quad E_{ton} = \left( \frac{T_{eff}}{T} - r_{ton}^* \right)^2, \quad E_{tut} = \left( \frac{\text{TUT}_{eff}}{\text{TUT}} - r_{tut}^* \right)^2$$
  3. *Errore di Ripartizione Volumetrica (Divergenza quadratica tra volumi effettivi e target):*
     $$E_{distr} = \frac{1}{2} \sum_{m \in \mathcal{M}} \left( \frac{v_m}{\sum_j v_j} - \hat{p}_m \right)^2$$
  4. *Errore di Varietà (Penalizzazione esercizi duplicati nel piano):*
     $$E_{variety} = \left( 1.0 - \frac{|\text{Esercizi Unici}|}{\text{Totale Esercizi Eseguiti}} \right)^2$$
  5. *Errore di Bilanciamento Giornaliero (Varianza normalizzata di fatica e volume):*
     $$E_{balance} = \frac{1}{2} \left( \frac{\operatorname{Var}(\mathbf{F}_{day})}{\sigma_{F,max}^2} + \frac{\operatorname{Var}(\mathbf{V}_{day})}{\sigma_{V,max}^2} \right)$$
  6. *Penalità di Violazione Vincoli ($P_{penalties}$):*
     Aggiunta di penalità additive per esercizi duplicati nella medesima sessione giornaliera ($+150.0$ per duplicato).

## 4.2 Calibrazione Stocastica dei Coefficienti di Scala
- Metodo Monte Carlo preliminare su $K = 500$ configurazioni casuali per calcolare il valore atteso $\mathbb{E}[E_i]$.
- Definizione dei fattori di riscalamento: $\sigma_i = 2 \cdot \mathbb{E}[E_i]$, necessaria a rendere ogni termine adimensionale e a garantire pari sensibilità rispetto ai pesi $w_i$.

## 4.3 Algoritmo di Simulated Annealing (Ricottura Simulata)
- **Schema Operativo e Fuga dai Minimi Locali:**
  - Ad ogni iterazione $k$, generazione di uno stato adiacente $\mathbf{x}' = \text{Mutate}(\mathbf{x})$ tramite operatori discreti elementari (aggiunta/rimozione/scambio esercizio, incremento/decremento reps, variazione RPE o parziali).
  - Variazione di energia: $\Delta f = f(\mathbf{x}') - f(\mathbf{x})$.
  - Criterio di accettazione di Metropolis:
    - Se $\Delta f < 0 \implies \mathbf{x} \leftarrow \mathbf{x}'$ (accettazione deterministica del miglioramento).
    - Se $\Delta f \ge 0 \implies \mathbf{x} \leftarrow \mathbf{x}'$ con probabilità $p = \exp\left(-\frac{\Delta f}{T_k}\right) > U(0,1)$ (accettazione stocastica per uscire da buche di potenziale subottimali).
- **Legge di Raffreddamento Geometrico:**
  $$T_{k+1} = \alpha \cdot T_k, \qquad \alpha = \left(\frac{T_{fin}}{T_0}\right)^{\frac{1}{N_{iter}}}$$
  (con $T_0 = 50.0$, $T_{fin} = 0.01$, $N_{iter} = 5000 \div 10000$).

## 4.4 Risultati Numerici e Convergenza Sperimentale
- Analisi delle curve di convergenza del costo $f(\mathbf{x})$ al variare del numero di iterazioni.
- Esempi pratici di schede generate ottimali a partire da distribuzioni target complesse.
