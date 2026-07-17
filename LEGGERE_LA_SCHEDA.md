# Come Leggere la Scheda di Allenamento

Questo documento spiega in linguaggio naturale la notazione utilizzata per scrivere e interpretare le schede di allenamento all'interno di questo progetto.

## Struttura Generale
Ogni scheda è suddivisa in **Giorni** (o sessioni di allenamento), indicati dal simbolo `#` seguito dal numero del giorno (es. `# 1`, `# 2`).
Sotto ogni giornata, troverai i vari esercizi da svolgere. Ogni esercizio è descritto da un blocco di testo composto da una **riga di intestazione** (che descrive l'esercizio) e da diverse **righe di progressione settimanale** sottostanti.

## Intestazione dell'Esercizio
La prima riga di ogni blocco definisce i parametri base dell'esercizio. Le informazioni sono separate dal simbolo `|` (pipe). Il formato è:

`Nome Esercizio | Tempo di Recupero | [Note aggiuntive o Tempo di esecuzione]`

**Esempi:**
- `Lat Machine | 3' | ultime mezze rep`: Indica l'esercizio "Lat Machine", con 3 minuti (3') di recupero tra una serie e l'altra. La nota specifica di fare delle "mezze ripetizioni" alla fine della serie.
- `Cable French Press | 2' | 1-0-3-1`: Esercizio "Cable French Press" con 2 minuti di recupero. I numeri indicano il *Tempo di esecuzione* (es. fase Concentrica - Fermo - fase Eccentrica - Fermo in secondi).

## Le Settimane (Progressione)
Le righe successive sotto l'intestazione indicano le **settimane del mesociclo** (solitamente 4 o 5 righe, una per ogni settimana). Leggere queste righe dall'alto verso il basso ti permette di vedere come progredisce il carico o il numero di ripetizioni nel corso del tempo.

La struttura base di ogni riga settimanale è:
`[Carico]..[Ripetizioni Serie 1].[Ripetizioni Serie 2].[Ripetizioni Serie 3]`

**Esempio base:**
`20..10.8.7`
- **Carico**: 20 (es. kg)
- **Serie 1**: 10 ripetizioni
- **Serie 2**: 8 ripetizioni
- **Serie 3**: 7 ripetizioni

## Notazioni Speciali e Tecniche d'Intensità

A seconda dell'allenamento, potrebbero esserci delle sintassi più avanzate per indicare tecniche di intensità o cambi di peso:

### 1. Ripetizioni Parziali, Forzate o Cheating
Se vedi il simbolo `+` o delle parentesi `()`, indicano delle ripetizioni "speciali" che si aggiungono a quelle normali completate da solo, seguendo quanto specificato nelle note dell'esercizio (es. ultime mezze rep, forzate, con leggero cheating, ecc.).
- `90..9+2.7+2`: Con 90kg, la prima serie è composta da 9 ripetizioni normali seguite da 2 ripetizioni speciali. La seconda serie è da 7 rep normali + 2 speciali.
- `70..11(1).10(2)`: Una notazione alternativa con le parentesi, dal significato equivalente (es. 11 rep normali + 1 forzata, 10 rep normali + 2 forzate).

### 2. Drop Set (Stripping / Scalaggio)
Quando il carico e/o le ripetizioni sono separati dal simbolo `/`, significa che c'è uno scalaggio di peso all'interno della stessa serie, senza recupero (tecnica del Drop Set). Questo è spesso suggerito con `ds` o `dds` (doppio drop set) nelle note.
- `60/45/35..11/7/8`: Questo rappresenta un'unica serie (doppio drop set). Si parte con 60kg per 11 ripetizioni, si scala immediatamente a 45kg per fare 7 ripetizioni, e infine si scala a 35kg per le ultime 8 ripetizioni.

### 3. Variazione di Carico tra le Serie
Alcune volte il peso viene ridotto (o aumentato) da una serie all'altra (Backoff set). In questo caso, il nuovo carico viene inserito all'interno della riga prima delle relative ripetizioni.
- `35..5.30..7`: La prima serie è svolta con 35kg per 5 ripetizioni. Finito il recupero, si abbassa il peso a 30kg per fare 7 ripetizioni nella seconda serie.

### 4. Esercizi a Corpo Libero (Bodyweight)
Se è presente la sigla `bw` (bodyweight) nelle note dell'esercizio, il "Carico" indicato all'inizio della riga spesso rappresenta il peso corporeo registrato dall'atleta in quella settimana, fungendo da riferimento per eventuali sovraccarichi o variazioni di peso.
- `79..10.9`: Peso corporeo di 79kg (nessun carico aggiuntivo), per due serie da 10 e 9 ripetizioni.

## Un Esempio Completo

```markdown
# 1
Lat Machine | 3' | ultime mezze rep
90..9+2.7+2
90..10+2.8+2
```

**Come interpretare questo blocco?**
1. Siamo nel **Giorno 1** della nostra scheda di allenamento.
2. Dobbiamo eseguire l'esercizio **Lat Machine**.
3. Il **recupero** previsto tra una serie e l'altra è di 3 minuti.
4. L'obiettivo indicato nelle note è arrivare a cedimento e poi "spremere" ulteriori **mezze ripetizioni**.
5. Nella **Settimana 1** (prima riga): Impostiamo 90kg di carico. Facciamo una prima serie da 9 ripetizioni complete seguite da 2 mezze ripetizioni. Riposiamo 3 minuti. Facciamo la seconda serie ottenendo 7 ripetizioni complete + 2 mezze.
6. Nella **Settimana 2** (seconda riga): Manteniamo lo stesso carico di 90kg. Tuttavia il nostro corpo si è adattato e siamo riusciti a fare un numero maggiore di ripetizioni complete: 10 nel primo set e 8 nel secondo, eseguendo sempre le 2 mezze ripetizioni finali.
