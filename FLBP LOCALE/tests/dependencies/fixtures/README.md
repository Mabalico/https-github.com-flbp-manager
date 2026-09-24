# Legacy spreadsheet fixture

`legacy-cp1251.xls` is a synthetic 3,072-byte Excel 5/BIFF5 file containing one scoring row. It contains no user data.

The workbook was generated with SheetJS 0.20.3 using ASCII headers (`Name`, `BirthDate`, `Games`, `Points`, `Blows`). The unique `TESTPLAYERX` label was replaced with the Windows-1251 bytes `c8 e2 e0 ed 20 cf e5 f2 f0 ee e2` (Иван Петров), and its CodePage record was set to 1251. This avoids relying on the current writer's limited BIFF5 character export. A separate CommonJS decode verified the resulting fixture.

The expected row has birth date `1994-07-13`, 4 games, 20 points and 2 blows. Keeping the binary fixture fixed prevents a write/read roundtrip from hiding corrupted legacy player names.
