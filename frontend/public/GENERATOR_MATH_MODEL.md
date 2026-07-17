# Modello Matematico: Ottimizzazione su Curva di Tensione Cumulativa

## 1. Variabili Decisionali
*   $x_{i,d} \in \{0, 1\}$: Attivazione. `1` se l'esercizio $i$ è programmato nel giorno $d$, `0` altrimenti.
*   $v_{i,d} \in \mathbb{N}$: Volume (numero di serie) per l'esercizio $i$ nel giorno $d$.
*   $r_{i,d} \in \mathbb{N}$: Ripetizioni per serie dell'esercizio $i$ nel giorno $d$.

## 2. Parametri (Input Modificabili da UI)
> [!IMPORTANT]
> **Tutti i vincoli e limiti di seguito elencati non sono hard-coded, ma devono essere esposti e modificabili liberamente dall'utente tramite l'interfaccia (UI).** I valori riportati sono le impostazioni di default correnti.

*   $D$: Numero giorni del microciclo. Deve essere compreso tra 3 e 7 ($3 \le D \le 7$).
*   $T$: Set di punti discreti che mappano il Range of Motion (ROM).
*   $C_{i,m}(t)$: Curva di tensione di base dell'esercizio $i$ sul muscolo $m$.
*   $T_m(t)$: Curva Target ideale di tensione. L'interfaccia deve permettere all'utente di impostarla scegliendo tra le seguenti forme (su dominio $t \in [0, 1]$):
    *   **Costante:** Tensione piatta per tutto il ROM ($T_m(t) = c$).
    *   **Sigmoide:** Crescente da 0 a 1 (enfasi sulla contrazione di picco).
    *   **Sigmoide Inversa:** Decrescente da 1 a 0 (enfasi sull'allungamento massimo).
    *   **Lineare (da 1 a 0):** Decrescente linearmente (enfasi proporzionale all'allungamento).
*   $F_i$: Costo di fatica sistemica dell'esercizio $i$.

**Limiti Operativi (Default):**
*   **Limiti Serie:** $V_{min} = 1$, $V_{max} = 6$.
*   **Limiti Ripetizioni:** $R_{min} = 5$, $R_{max} = 20$.
*   **Limiti Esercizi/Giorno:** $E_{min} = 3$, $E_{max} = 10$.
*   **Limite Fatica Giornaliera:** $F_{max\_giorno} = 1500$.
*   **Limiti Recupero:** $Rest_{min} = 80\text{s}$ (1'20"), $Rest_{max} = 210\text{s}$ (3'30").

## 3. Funzione Obiettivo: Ottimizzazione Multi-Obiettivo (Scalarizzata)

L'obiettivo generale è minimizzare simultaneamente l'errore sulla curva di tensione e l'errore sugli indici di efficienza (Ratios) dell'allenamento. 

### 3.1 Pesi e Target di Efficienza (Impostabili da UI)
L'utente deve poter definire i **Pesi ($w$)** per decidere l'importanza di ciascun parametro (la cui somma deve fare 1.0) e i **Target Ideali** per le frazioni di efficienza (da 0.0 a 1.0):
*   $w_{curva}$: Peso per l'aderenza alla Curva Target.
*   $w_{vol}$: Peso per l'efficienza del Volume. (Target Ideale: $Target_{vol}$)
*   $w_{ton}$: Peso per l'efficienza del Tonnellaggio. (Target Ideale: $Target_{ton}$)
*   $w_{tut}$: Peso per l'efficienza del TUT. (Target Ideale: $Target_{tut}$)
*   $w_{distr}$: Peso per l'aderenza alla distribuzione volumetrica Macro/Micro richiesta.
*   $w_{variety}$: Peso per incentivare la diversità degli esercizi su tutto il microciclo.

### 3.2 Calcolo degli Errori (Uniformati nel dominio [0, 1])
Per garantire che i pesi ($w$) assegnati dall'interfaccia abbiano un impatto perfettamente simmetrico e democratico, TUTTI gli errori sono matematicamente schiacciati nello stesso dominio `[0.0, 1.0]`. Questo si ottiene dividendo gli scarti per il loro massimo valore teorico o effettuando la media anziché la sommatoria.

1.  **Errore Curva (Media del MSE):**  L'errore quadratico medio calcolato sui punti della curva viene sommato per tutti i muscoli e diviso per il numero dei muscoli analizzati: $E_{curva} = \frac{1}{|M|} \sum_{m} \frac{\sum (V_m - T_m)^2}{Risoluzione}$
2.  **Errore Volume:** $E_{vol} = \left( \frac{\text{Effective Volume}}{\text{Total Volume}} - Target_{vol} \right)^2$
3.  **Errore Tonnellaggio:** $E_{ton} = \left( \frac{\text{Effective Tonnage}}{\text{Total Tonnage}} - Target_{ton} \right)^2$
4.  **Errore TUT:** $E_{tut} = \left( \frac{\text{Effective TUT}}{\text{Total TUT}} - Target_{tut} \right)^2$
5.  **Errore Distribuzione Volumi:** Diviso per 2 (massima distanza teorica tra due distribuzioni percentuali)
    $$ Target_{globale}(m) = Macro\%(M) \times Sub\%(m) $$
    $$ E_{distr} = \frac{1}{2.0} \sum_{m} \left( \frac{V_{effettivo}(m)}{V_{totale}} - Target_{globale}(m) \right)^2 $$
6.  **Errore Varietà:**
    $$ E_{variety} = \left( 1 - \frac{\text{Unique Exercises}}{\text{Total Exercises}} \right)^2 $$
7.  **Errore di Bilanciamento Giornaliero (Ex-Varianza):**
    Assicura che il volume e la fatica siano equamente spalmati nei vari giorni del microciclo. La varianza giornaliera viene divisa per la varianza massima teorica, mappando il risultato in `[0, 1]`.
    $$ E_{balance} = \frac{1}{2} \left( \frac{Var(\text{Fatigue})}{Var_{max\_F}} + \frac{Var(\text{Volume})}{Var_{max\_V}} \right) $$

### 3.3 Funzione Obiettivo Globale (Somma Pesata Softmax)
I pesi $w$ forniti dalla UI (sottoposti a Normalizzazione Softmax in modo che $\sum w = 1.0$) vengono moltiplicati per i rispettivi Errori.
L'algoritmo minimizzerà la seguente equazione:
$$ \min \Big( w_{curva} \cdot E_{curva} + w_{vol} \cdot E_{vol} + w_{ton} \cdot E_{ton} + w_{tut} \cdot E_{tut} + w_{distr} \cdot E_{distr} + w_{variety} \cdot E_{variety} + w_{balance} \cdot E_{balance} \Big) $$

## 4. Vincoli Fisiologici (Constraints)

### 4.1. Limiti di Serie e Ripetizioni (Big-M)
Se l'esercizio è scelto, deve rispettare i parametri minimi e massimi. Se non è scelto, i valori collassano a 0.
$$ V_{min} \cdot x_{i,d} \le v_{i,d} \le V_{max} \cdot x_{i,d} \quad \text{(es. } 1 \le v_{i,d} \le 6 \text{)} $$
$$ R_{min} \cdot x_{i,d} \le r_{i,d} \le R_{max} \cdot x_{i,d} \quad \text{(es. } 5 \le r_{i,d} \le 20 \text{)} $$

### 4.2. Densità Minima e Massima per Giorno
$$ E_{min} \le \sum_{i \in E} x_{i,d} \le E_{max} \quad \text{(es. } 3 \le \text{Esercizi} \le 10 \text{)} $$

### 4.4. Recupero Deterministico (Proporzionale alla Fatica)
Il recupero $rest_i$ non è una variabile libera da ottimizzare, ma viene calcolato a priori tramite un'euristica non-lineare basata sulla fatica sistemica $F_i$ dell'esercizio:
* **Bassa Fatica ($F_i \le 2.0$):** Recupero fisso a 1 minuto (60s). Ideale per isolamento leggero.
* **Fatica Media ($2.0 < F_i \le 7.0$):** Scala linearmente da 1 minuto a 3 minuti.
* **Alta Fatica ($F_i > 7.0$):** Scala linearmente da 3 minuti fino a un massimo di 3 minuti e 30 secondi (per esercizi sistemici pesanti come lo Stacco).
I valori calcolati vengono poi arrotondati al mezzo minuto più vicino (es. 2'30").

### 4.5. Tempo di Recupero Muscolare / Neurale (Overlap)
Per forzare l'algoritmo a cambiare angolo di lavoro e non saturare l'SNC con lo stesso identico movimento per aggirare il tetto dei set, viene applicata una penalità massiccia alla funzione di Costo se lo stesso esercizio viene programmato più di una volta nello stesso giorno.
$$ Costo \mathrel{+}= \text{Penalty} \quad \text{se } \sum x_{i,d} > 1 \text{ nello stesso } d $$
