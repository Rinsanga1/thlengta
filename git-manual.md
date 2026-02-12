#!/bin/bash

# === FIRST TIME SETUP ===

git init
git remote add origin https://github.com/enfuego-r/thlengta.git
git branch -M main
git push -u origin main

# === DAILY WORKFLOW ===

git status                # see changes
git add .                 # stage all changes
git commit -m "message"   # save snapshot
git push                  # upload to GitHub

# === IF DB WAS ACCIDENTALLY COMMITTED ===

git rm --cached data.sqlite
git rm --cached *.sqlite
git commit -m "Remove database from repo"
git push

