# Выгрузка тела Anny

Создаёт `anny.json` и `anny.bin` для браузера. Готовые файлы уже лежат в `apps/web/public/body/`; запускать нужно, только если меняется набор параметров или ранг сжатия.

```bash
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python export_anny.py --out ../../apps/web/public/body --rank 48
```

Первый запуск Anny собирает кэш несколько минут. PyTorch с PyPI весит несколько гигабайт; версия только для процессора меньше.
