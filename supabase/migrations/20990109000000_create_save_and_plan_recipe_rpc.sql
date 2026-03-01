-- This function handles the entire "Add to Plan" logic in one go.
CREATE OR REPLACE FUNCTION public.save_recipe_and_add_to_plan(
  p_recipe_data jsonb,
  p_meal_date timestamp with time zone,
  p_meal_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_recipe_id bigint;
BEGIN
  -- Use a CTE to upsert the recipe and capture its ID.
  -- ON CONFLICT, we do nothing but still need to get the ID of the existing recipe.
  WITH upsert AS (
    INSERT INTO public.recipes (
      user_id, name, description, ingredients, instructions,
      prep_time_minutes, cook_time_minutes, servings, tags
    )
    VALUES (
      v_user_id,
      p_recipe_data->>'name',
      p_recipe_data->>'description',
      (p_recipe_data->'ingredients'),
      (p_recipe_data->'instructions'),
      (p_recipe_data->>'prep_time_minutes')::integer,
      (p_recipe_data->>'cook_time_minutes')::integer,
      (p_recipe_data->>'servings')::integer,
      (SELECT array_agg(elem::text) FROM jsonb_array_elements_text(p_recipe_data->'tags'))
    )
    ON CONFLICT (user_id, name) DO NOTHING
    RETURNING id
  )
  SELECT id INTO v_recipe_id FROM upsert;

  -- If the CTE returned no ID (because the recipe already existed), select it now.
  IF v_recipe_id IS NULL THEN
    SELECT id INTO v_recipe_id FROM public.recipes WHERE user_id = v_user_id AND name = p_recipe_data->>'name';
  END IF;

  -- Create the meal plan entry with the retrieved recipe ID.
  INSERT INTO public.meal_plan_entries (user_id, recipe_id, meal_date, meal_type)
  VALUES (v_user_id, v_recipe_id, p_meal_date, p_meal_type);

END;
$$;

-- Harden the function per the database guide.
ALTER FUNCTION public.save_recipe_and_add_to_plan(jsonb, timestamp with time zone, text)
SET search_path = public; 