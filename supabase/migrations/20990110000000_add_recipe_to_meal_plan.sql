-- Step 1: Create the function
create or replace function public.add_recipe_to_meal_plan(p_recipe_id int, p_meal_date timestamptz, p_meal_type text)
returns void as $$
declare
  reminder_send_at timestamptz;
  minutes_until_meal int;
begin
  -- First, add the meal to the plan
  insert into public.meal_plan_entries (user_id, recipe_id, meal_date, meal_type)
  values (
    auth.uid(),
    p_recipe_id,
    p_meal_date,
    p_meal_type
  );

  -- Next, calculate the notification send time based on dynamic rules
  minutes_until_meal := floor(extract(epoch from (p_meal_date - now())) / 60);

  if minutes_until_meal >= 120 then
    reminder_send_at := p_meal_date - interval '2 hours';
  elsif minutes_until_meal >= 60 then
    reminder_send_at := p_meal_date - interval '1 hour';
  elsif minutes_until_meal >= 30 then
    reminder_send_at := p_meal_date - interval '30 minutes';
  else
    -- If the meal is too soon, don't schedule a notification
    reminder_send_at := null;
  end if;

  -- Finally, if a send time was determined, schedule the notification
  if reminder_send_at is not null then
    insert into public.scheduled_notifications (user_id, notification_type, notification_data, send_at)
    values (
      auth.uid(),
      'MEAL_REMINDER',
      jsonb_build_object('recipe_id', p_recipe_id),
      reminder_send_at
    );
  end if;

end;
$$ language plpgsql;

-- Step 2: Harden the function for security
ALTER FUNCTION public.add_recipe_to_meal_plan(int, timestamptz, text)
SET search_path = public; 