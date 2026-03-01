-- Add author_tips column to recipes table
-- Stores useful cooking tips, serving suggestions, storage advice extracted from recipe web pages
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS author_tips text[];
