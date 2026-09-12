package org.healthpassport;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;import java.time.*;import org.junit.jupiter.api.Test;
class EligibilityProviderTest {
@Test void syntheticNeverVerifiesARealCompanyOrFuturePolicy(){var provider=new EligibilityProvider.Synthetic();assertEquals("UNKNOWN",provider.verify(new EligibilityProvider.Request("Real company","Plan",Map.of(),null,null)).status());assertEquals("UNVERIFIED",provider.verify(new EligibilityProvider.Request("Synthetic Example","Plan",Map.of(),LocalDate.now().plusDays(1).toString(),null)).status());assertEquals("UNKNOWN",new EligibilityProvider.Unconfigured().verify(new EligibilityProvider.Request("Company","Plan",Map.of(),null,null)).status());}
@Test void externalAdapterRequiresPrivateHttpsConfiguration(){var mapper=new com.fasterxml.jackson.databind.ObjectMapper();assertThrows(IllegalArgumentException.class,()->new HttpEligibilityProvider("http://example.org/eligibility","secret",mapper));assertThrows(IllegalArgumentException.class,()->new HttpEligibilityProvider("https://example.org/eligibility", "",mapper));assertThrows(IllegalArgumentException.class,()->new HttpEligibilityProvider("https://user@example.org/eligibility","secret",mapper));}
}
