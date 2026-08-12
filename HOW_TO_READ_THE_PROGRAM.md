# How to Read the Workout Program

This document explains in natural language the notation used to write and interpret the workout programs within this project.

## General Structure
Each program is divided into **Days** (or training sessions), indicated by the `#` symbol followed by the day number (e.g., `# 1`, `# 2`).
Below each day, you will find the various exercises to perform. Each exercise is described by a text block consisting of a **header line** (which describes the exercise) and several **weekly progression lines** below it.

## Exercise Header
The first line of each block defines the basic parameters of the exercise. The information is separated by the `|` (pipe) symbol. The format is:

`Exercise Name | Rest Time | [Additional notes or Execution tempo]`

**Examples:**
- `Lat Machine | 3' | last half reps`: Indicates the "Lat Machine" exercise, with 3 minutes (3') of rest between sets. The note specifies to do "half repetitions" at the end of the set.
- `Cable French Press | 2' | 1-0-3-1`: "Cable French Press" exercise with 2 minutes of rest. The numbers indicate the *Execution tempo* (e.g., Concentric phase - Pause - Eccentric phase - Pause in seconds).

## The Weeks (Progression)
The subsequent lines below the header indicate the **mesocycle weeks** (usually 4 or 5 lines, one for each week). Reading these lines from top to bottom allows you to see how the load or the number of repetitions progresses over time.

The basic structure of each weekly line is:
`[Load]..[Reps Set 1].[Reps Set 2].[Reps Set 3]`

**Basic Example:**
`20..10.8.7`
- **Load**: 20 (e.g., kg)
- **Set 1**: 10 reps
- **Set 2**: 8 reps
- **Set 3**: 7 reps

## Special Notations and Intensity Techniques

Depending on the workout, there might be more advanced syntaxes to indicate intensity techniques or weight changes:

### 1. Partial, Forced, or Cheating Reps
If you see the `+` symbol or parentheses `()`, they indicate "special" repetitions added to the normal ones completed by yourself, following what is specified in the exercise notes (e.g., last half reps, forced reps, with slight cheating, etc.).
- `90..9+2.7+2`: With 90kg, the first set consists of 9 normal reps followed by 2 special reps. The second set is 7 normal reps + 2 special reps.
- `70..11(1).10(2)`: An alternative notation with parentheses, with an equivalent meaning (e.g., 11 normal reps + 1 forced, 10 normal reps + 2 forced).

### 2. Drop Sets (Stripping)
When the load and/or repetitions are separated by the `/` symbol, it means there is a weight drop within the same set, without rest (Drop Set technique). This is often suggested with `ds` or `dds` (double drop set) in the notes.
- `60/45/35..11/7/8`: This represents a single set (double drop set). You start with 60kg for 11 reps, immediately drop to 45kg to do 7 reps, and finally drop to 35kg for the last 8 reps.

### 3. Load Variation Between Sets
Sometimes the weight is reduced (or increased) from one set to another (Backoff set). In this case, the new load is inserted inside the line before the relative repetitions.
- `35..5.30..7`: The first set is performed with 35kg for 5 reps. After the rest, the weight is lowered to 30kg to do 7 reps in the second set.

### 4. Bodyweight Exercises
If the acronym `bw` (bodyweight) is present in the exercise notes, the "Load" indicated at the beginning of the line often represents the body weight recorded by the athlete in that week, serving as a reference for any overloads or weight variations.
- `79..10.9`: Body weight of 79kg (no additional load), for two sets of 10 and 9 reps.

## A Complete Example

```markdown
# 1
Lat Machine | 3' | last half reps
90..9+2.7+2
90..10+2.8+2
```

**How to interpret this block?**
1. We are on **Day 1** of our workout program.
2. We have to perform the **Lat Machine** exercise.
3. The scheduled **rest** between sets is 3 minutes.
4. The goal indicated in the notes is to reach failure and then "squeeze" out additional **half repetitions**.
5. In **Week 1** (first line): We set a 90kg load. We do a first set of 9 full reps followed by 2 half reps. We rest for 3 minutes. We do the second set getting 7 full reps + 2 half reps.
6. In **Week 2** (second line): We keep the same load of 90kg. However, our body has adapted and we managed to do a greater number of full reps: 10 in the first set and 8 in the second, always performing the final 2 half reps.
