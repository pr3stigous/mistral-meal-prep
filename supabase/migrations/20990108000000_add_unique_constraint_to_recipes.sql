-- This ensures a user cannot have two recipes with the exact same name.
ALTER TABLE public.recipes
ADD CONSTRAINT recipes_user_id_name_key UNIQUE (user_id, name); 