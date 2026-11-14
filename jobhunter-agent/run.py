#!/usr/bin/env python3
"""Entry point.
   python run.py          -> start the agent (24/7)
   python run.py check    -> test all connections
   python run.py export   -> write data/companies_*.csv without Telegram
"""
import asyncio
import sys

from jobhunter.config import Config, load_env


def main():
    load_env()
    cfg = Config.load()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    if cmd == "check":
        from jobhunter.check import run_check
        run_check(cfg)
    elif cmd == "export":
        import csv
        from datetime import datetime
        from jobhunter.db import DB
        db = DB(cfg.db_path)
        rows = db.q("SELECT name,country,city,website,score,has_job,roles,visa_signal,best_email,career_url,"
                    "apply_url,phone,address,status FROM companies ORDER BY score DESC")
        path = f"data/companies_{datetime.now():%Y%m%d_%H%M}.csv"
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(rows[0].keys() if rows else [])
            for r in rows:
                w.writerow(list(r))
        print(f"{len(rows)} rows -> {path}")
    else:
        from jobhunter.agent import Agent
        try:
            asyncio.run(Agent(cfg).run())
        except KeyboardInterrupt:
            print("বন্ধ করা হলো।")


if __name__ == "__main__":
    main()
