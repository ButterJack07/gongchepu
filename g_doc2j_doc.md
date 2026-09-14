# Gongche Archive To Numbered Archive

This document records the current Gongche-to-numbered-notation conversion
algorithm before further adjustments.

## Data Flow

```text
Gongche editor
  -> Gongche archive
  -> numbered-notation archive
  -> numbered-notation view
```

The Gongche archive is the source for a new conversion. Once generated, the
numbered-notation archive fixes note slots and lyric slots. The numbered view
renders that archive and should not move notes or lyrics again.

## Gongche Archive

Each lyric character can have multiple Gongche notes. Each note has zero to
three rhythm symbols.

```text
春 [工@、] [尺@。]
```

Archive rhythm encodings:

```text
、  first beat
。  second beat
-  dash upgrade
<  triangle upgrade
```

Internal symbols are `—` and `△`.

## Initial Placement

Every rhythm mark provides a time position:

```text
、 / —  -> first beat
。 / △  -> second beat
```

Multiple marks on one Gongche note may create multiple note slots.

```text
尺@、。- -> first beat, second beat, first-beat upgrade position
```

`、` starts a new 2/4 bar. `。` enters the second beat of the current bar.

## Adjacent Upgrade Exceptions

Within one Gongche note:

```text
。-  -> treated as 。、
、<  -> treated as 、。
```

The second mark supplies its ordinary beat position and does not trigger its
upgrade behavior.

## Upgrade And Front Extension

`—` upgrades a comma-like first-beat position. `△` upgrades a period-like
second-beat position.

The original slot is the board/eye position. Its forward extension is the
front-extension position.

Both note positions are retained:

```text
front extension: pitch{lyric}
board/eye slot:  pitch{}
```

The lyric is anchored only at the earlier front-extension copy. The original
board/eye copy remains a real note but has an empty lyric field.

## Lyric Anchoring

Every source lyric character has a unique `rowId`; equal characters in
different positions are independent.

For each `rowId`:

1. Collect every generated numbered-note copy.
2. Clear lyrics from all copies.
3. If the character has a front-extension copy, put the lyric on the earliest
   front-extension copy.
4. Otherwise, put the lyric on the character's first generated note.
5. All other copies use an empty lyric field.

Thus, one lyric occurrence appears once in the numbered archive, while every
one of its notes remains present.

## Grace Mark

`√` is not a separate note slot and has no rhythm mark.

It attaches to the immediately preceding actual note and is recorded between
the numbered pitch and the lyric field:

```text
2√{胖}
```

Multiple grace marks are preserved:

```text
3√√{字}
```

The grace pitch calculation is intentionally deferred.

## Numbered Archive

```text
---
format: numbered-notation
version: 1
meter: 2/4
source: gongchepu
---

## 简谱

### 小节1
第一拍: 2{胖}
第二拍: 6{黄} 2{}
```

High and low octave storage:

```text
^5{字}  high
_5{字}  low
```

The numbered archive stores fixed bars, beats, pitch slots, lyric anchors,
octave data, and grace marks. It does not store visual subdivision decisions.

## Numbered View

The numbered view must:

- render every stored note slot, including `5{}`;
- render lyrics only where the archive provides them;
- render high and low octave marks;
- perform visual subdivision after reading the numbered archive;
- never alter Gongche archive data.
