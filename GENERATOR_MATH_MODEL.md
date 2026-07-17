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

### 3.2 Calcolo degli Errori (Normalizzati)
Gli errori parziali (tutti confinati in un range standard) sono calcolati come la distanza quadratica dal target richiesto:

1.  **Errore Curva:**  $E_{curva} = \sum_{m \in M} \sum_{k} \left( V_m(t_k) - T_m(t_k) \right)^2$
2.  **Errore Volume:** $E_{vol} = \left( \frac{\text{Effective Volume}}{\text{Total Volume}} - Target_{vol} \right)^2$
3.  **Errore Tonnellaggio:** $E_{ton} = \left( \frac{\text{Effective Tonnage}}{\text{Total Tonnage}} - Target_{ton} \right)^2$
4.  **Errore TUT:** $E_{tut} = \left( \frac{\text{Effective TUT}}{\text{Total TUT}} - Target_{tut} \right)^2$

### 3.3 Funzione Obiettivo Globale (Somma Pesata)
L'algoritmo minimizzerà la seguente equazione, trovando il miglior compromesso in base ai pesi:
$$ \min \Big( w_{curva} \cdot E_{curva} + w_{vol} \cdot E_{vol} + w_{ton} \cdot E_{ton} + w_{tut} \cdot E_{tut} \Big) $$

## 4. Vincoli Fisiologici (Constraints)

### 4.1. Limiti di Serie e Ripetizioni (Big-M)
Se l'esercizio è scelto, deve rispettare i parametri minimi e massimi. Se non è scelto, i valori collassano a 0.
$$ V_{min} \cdot x_{i,d} \le v_{i,d} \le V_{max} \cdot x_{i,d} \quad \text{(es. } 1 \le v_{i,d} \le 6 \text{)} $$
$$ R_{min} \cdot x_{i,d} \le r_{i,d} \le R_{max} \cdot x_{i,d} \quad \text{(es. } 5 \le r_{i,d} \le 20 \text{)} $$

### 4.2. Densità Minima e Massima per Giorno
$$ E_{min} \le \sum_{i \in E} x_{i,d} \le E_{max} \quad \text{(es. } 3 \le \text{Esercizi} \le 10 \text{)} $$

### 4.3. Budget Fatica Sistemica Assoluta
$$ \sum_{i \in E} v_{i,d} \cdot F_i \le F_{max\_giorno} \quad \text{(es. } 1500 \text{)} $$

### 4.4. Recupero Deterministico (Proporzionale alla Fatica)
Il recupero $rest_i$ (in secondi) non è una variabile libera da ottimizzare. Viene calcolato a priori e assegnato all'esercizio in proporzione alla sua fatica $F_i$, linearmente mappata tra il min e il max consentito.
$$ rest_i = Rest_{min} + \left( \frac{F_i - \min(F)}{\max(F) - \min(F)} \right) \times (Rest_{max} - Rest_{min}) $$

### 4.5. Tempo di Recupero Muscolare / Neurale (Overlap)
Evitare che esercizi neuralmente distruttivi si susseguano.
$$ x_{i,d} + x_{i,d+1} \le 1 \quad \forall i \in E_{heavy}, \forall d \in [1, D-1] $$
