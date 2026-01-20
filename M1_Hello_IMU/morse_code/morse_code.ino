#define TIME_UNIT 200

// Create a dot in the sequence
void morse(int bit)
{
  /*
    Rules according to Wikipedia source (about individual indications):
    The duration of a dah is three times the duration of a dit. 
    Each dit or dah within an encoded character is followed by a period of signal absence, called a space, 
      equal to the dit duration.
  */

  // Turn on the LED
  digitalWrite(LED_BUILTIN, HIGH);
  
  // DOT
  if(bit == 0)
    delay(TIME_UNIT);

  // DASH
  else if(bit == 1)
    delay(3*TIME_UNIT);

  // Turn off the LED again
  digitalWrite(LED_BUILTIN, LOW);

  // Duration required after each bit in the letter
  delay(TIME_UNIT);
}

void generate_sequence(char* seq, int len)
{
  /* 
    Rules according to Wikipedia source (about letters and words):
    The letters of a word are separated by a space of duration equal to three dits, and words are separated 
      by a space equal to seven dits.
  */

  for(int i = 0; i < len; i++)
  {
    if(seq[i] == 'H')
    {
      morse(0); morse(0); morse(0); morse(0);
    }
    else if(seq[i] == 'E')
    {
      morse(0);
    }
    else if(seq[i] == 'L')
    {
      morse(0); morse(1); morse(0); morse(0);
    }
    else if(seq[i] == 'O')
    {
      morse(1); morse(1); morse(1);
    }
    else if(seq[i] == 'I')
    {
      morse(0); morse(0);
    }
    else if(seq[i] == 'M')
    {
      morse(1); morse(1);
    }
    else if(seq[i] == 'U')
    {
      morse(0); morse(0); morse(1);
    }
    // Time delay required after each letter in word
    delay(3*TIME_UNIT);

    // Time delay after each word
    if(seq[i] == ' ')
      delay((7-3)*TIME_UNIT);
  }
}

void setup() {
  // put your setup code here, to run once:
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  delay(1000);
  char str[] = "HELLO IMU";
  generate_sequence(str, 9);

  // Delay for five seconds before repeating the message
  delay(5000);

  // // TEST FOR BLINKING
  // digitalWrite(LED_BUILTIN, HIGH);  // turn the LED on (HIGH is the voltage level)
  // delay(200);                      // wait for a second
  // digitalWrite(LED_BUILTIN, LOW);   // turn the LED off by making the voltage LOW
  // delay(200);                      // wait for a second
}
